import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends

from app.core.auth import require_api_auth

router = APIRouter()

_COLUMNS = 120
_ROWS = 50


# ---------------------------------------------------------------------------
# /proc helpers — work inside the container because Linux shares the host
# kernel's /proc/meminfo, /proc/stat, /proc/loadavg with host-network containers.
# ---------------------------------------------------------------------------

def _read_proc(path: str) -> str:
    try:
        return Path(path).read_text()
    except OSError:
        return ""


def _parse_meminfo() -> dict[str, int]:
    info: dict[str, int] = {}
    for line in _read_proc("/proc/meminfo").splitlines():
        if ":" in line:
            key, _, val = line.partition(":")
            parts = val.strip().split()
            info[key.strip()] = int(parts[0]) if parts else 0
    return info


def _parse_cpu_times(line: str) -> tuple[int, int]:
    parts = line.split()
    vals = [int(x) for x in parts[1:]]
    total = sum(vals)
    idle = vals[3] + (vals[4] if len(vals) > 4 else 0)  # idle + iowait
    return total, idle


def _sample_cpu() -> tuple[float, list[float]]:
    """Return (total_pct, [per_core_pcts]) using a 250 ms sample."""
    raw1 = _read_proc("/proc/stat")
    time.sleep(0.25)
    raw2 = _read_proc("/proc/stat")

    def _lines(raw: str) -> dict[str, str]:
        return {l.split()[0]: l for l in raw.splitlines() if l.startswith("cpu")}

    m1, m2 = _lines(raw1), _lines(raw2)

    def _pct(k: str) -> float:
        if k not in m1 or k not in m2:
            return 0.0
        t1, i1 = _parse_cpu_times(m1[k])
        t2, i2 = _parse_cpu_times(m2[k])
        dtotal = t2 - t1
        return max(0.0, (1.0 - (i2 - i1) / dtotal) * 100.0) if dtotal else 0.0

    total = _pct("cpu")
    cores = [_pct(k) for k in sorted(m1) if k != "cpu" and k in m2]
    return total, cores


def _parse_loadavg() -> tuple[float, float, float, str]:
    parts = _read_proc("/proc/loadavg").split()
    la1 = float(parts[0]) if len(parts) > 0 else 0.0
    la5 = float(parts[1]) if len(parts) > 1 else 0.0
    la15 = float(parts[2]) if len(parts) > 2 else 0.0
    tasks = parts[3] if len(parts) > 3 else "?"
    return la1, la5, la15, tasks


def _parse_uptime() -> float:
    parts = _read_proc("/proc/uptime").split()
    return float(parts[0]) if parts else 0.0


def _parse_net_dev() -> dict[str, dict[str, int]]:
    stats: dict[str, dict[str, int]] = {}
    for line in _read_proc("/proc/net/dev").splitlines()[2:]:
        if ":" not in line:
            continue
        iface, _, data = line.partition(":")
        iface = iface.strip()
        parts = data.split()
        if len(parts) >= 9:
            stats[iface] = {"rx": int(parts[0]), "tx": int(parts[8])}
    return stats


def _read_processes() -> list[dict]:
    procs: list[dict] = []
    proc_dir = Path("/proc")
    for pid_dir in proc_dir.iterdir():
        if not pid_dir.name.isdigit():
            continue
        try:
            cmdline = (pid_dir / "cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", errors="replace").strip()
            stat_text = (pid_dir / "stat").read_text()
            status_text = (pid_dir / "status").read_text()
            mem_kb = 0
            for l in status_text.splitlines():
                if l.startswith("VmRSS:"):
                    mem_kb = int(l.split()[1])
                    break
            stat_parts = stat_text.split()
            state = stat_parts[2] if len(stat_parts) > 2 else "?"
            comm = stat_text.split("(")[1].split(")")[0] if "(" in stat_text else "?"
            procs.append({
                "pid": int(pid_dir.name),
                "cmd": cmdline[:72] or comm,
                "state": state,
                "mem_kb": mem_kb,
            })
        except (OSError, ValueError, IndexError):
            continue
    return procs


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _bar(fraction: float, width: int = 20) -> str:
    filled = max(0, min(width, int(fraction * width)))
    return "\u2588" * filled + "\u2591" * (width - filled)


def _human_bytes(b: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b //= 1024
    return f"{b:.1f} PB"


def _fmt_uptime(seconds: float) -> str:
    s = int(seconds)
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    return f"{d}d {h:02}:{m:02}:{s:02}" if d else f"{h:02}:{m:02}:{s:02}"


# ---------------------------------------------------------------------------
# Snapshot builder (blocking — run via executor)
# ---------------------------------------------------------------------------

def _build_snapshot() -> str:
    meminfo = _parse_meminfo()
    cpu_total, core_pcts = _sample_cpu()
    la1, la5, la15, tasks = _parse_loadavg()
    uptime_secs = _parse_uptime()
    net = _parse_net_dev()
    procs = _read_processes()

    mem_total = meminfo.get("MemTotal", 1)
    mem_avail = meminfo.get("MemAvailable", 0)
    mem_used = mem_total - mem_avail
    mem_pct = mem_used / mem_total if mem_total else 0.0
    mem_buffers = meminfo.get("Buffers", 0)
    mem_cached = meminfo.get("Cached", 0)
    swap_total = meminfo.get("SwapTotal", 0)
    swap_free = meminfo.get("SwapFree", 0)
    swap_used = swap_total - swap_free

    W = _COLUMNS
    sep = "\u2500" * W
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines: list[str] = []
    lines.append(f"\u250c\u2500 SYSTEM SNAPSHOT  {now_str}  up {_fmt_uptime(uptime_secs)} \u2500\u2510")
    lines.append("")

    # CPU
    lines.append(f"  CPU  [{_bar(cpu_total / 100)}] {cpu_total:5.1f}%   Load avg: {la1:.2f}  {la5:.2f}  {la15:.2f}   Tasks: {tasks}")
    if core_pcts:
        row_parts: list[str] = []
        for i, pct in enumerate(core_pcts[:8]):
            row_parts.append(f"  {i}[{_bar(pct / 100, 10)}]{pct:4.0f}%")
            if len(row_parts) == 4:
                lines.append("".join(row_parts))
                row_parts = []
        if row_parts:
            lines.append("".join(row_parts))
    lines.append("")

    # Memory
    mem_used_str = f"{mem_used // 1024} M / {mem_total // 1024} M"
    swap_str = f"  Swap: {swap_used // 1024} M / {swap_total // 1024} M" if swap_total else "  Swap: none"
    lines.append(f"  MEM  [{_bar(mem_pct)}] {mem_pct * 100:5.1f}%   {mem_used_str} used{swap_str}")
    lines.append(f"       Buffers: {mem_buffers // 1024} M   Cached: {mem_cached // 1024} M   Available: {mem_avail // 1024} M")
    lines.append("")

    # Network
    net_rows = [
        f"  {iface:<14} rx: {_human_bytes(s['rx']):<14} tx: {_human_bytes(s['tx'])}"
        for iface, s in sorted(net.items())
        if iface != "lo" and s["rx"] + s["tx"] > 0
    ]
    if net_rows:
        lines.append("  NETWORK")
        lines.extend(net_rows)
        lines.append("")

    # Process table
    procs_sorted = sorted(procs, key=lambda p: p["mem_kb"], reverse=True)
    lines.append(f"  {'PID':>7}  {'S':1}  {'MEM':>7}  COMMAND")
    lines.append(f"  {sep[:7]}  {'-'}  {sep[:7]}  {sep[:50]}")
    for p in procs_sorted[:20]:
        mem_str = f"{p['mem_kb'] // 1024:>5} M"
        lines.append(f"  {p['pid']:>7}  {p['state']:<1}  {mem_str}  {p['cmd'][:60]}")
    lines.append("")
    lines.append("\u2514" + "\u2500" * (W - 1))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/debug/btop/snapshot", dependencies=[Depends(require_api_auth)])
async def system_snapshot() -> dict:
    loop = asyncio.get_running_loop()
    snapshot_text = await loop.run_in_executor(None, _build_snapshot)
    snapshot_lines = snapshot_text.splitlines()
    return {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "refresh_hint_seconds": 5,
        "viewport": {
            "columns": _COLUMNS,
            "rows": _ROWS,
        },
        "line_count": len(snapshot_lines),
        "snapshot_text": snapshot_text,
        "snapshot_lines": snapshot_lines,
    }
