import re
import urllib.error
import urllib.request
import json
from datetime import datetime, timezone
import os
import platform
import socket
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException

from app.core.internal_metrics import internal_metrics
from app.core.config import settings
from app.services.wireguard import wireguard_service

router = APIRouter()

_METRIC_LINE_RE = re.compile(
    r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|NaN|[+-]Inf)(?:\s+\d+)?$"
)
_LABEL_RE = re.compile(r'(\w+)="((?:\\.|[^"])*)"')
_LAST_CPU_SNAPSHOT: tuple[int, int] | None = None
_SIDECAR_CACHE: dict[str, dict] = {}

_SIDECAR_TTL_SECONDS = {
    # High-value volatile telemetry: refresh frequently.
    "node_exporter": 20.0,
    "podman_exporter": 20.0,
    "postgres_exporter": 25.0,
    "falcosidekick": 25.0,
    # Medium volatility operational health.
    "parca": 45.0,
    "ebpf_agent": 45.0,
    # Lower volatility control/metadata endpoints.
    "crowdsec": 90.0,
    "trivy_server": 180.0,
}


def _to_float(raw: str) -> float:
    if raw == "+Inf":
        return float("inf")
    if raw == "-Inf":
        return float("-inf")
    if raw == "NaN":
        return float("nan")
    return float(raw)


def _parse_labels(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    labels: dict[str, str] = {}
    for key, value in _LABEL_RE.findall(raw):
        labels[key] = value.replace(r'\"', '"').replace(r"\\", "\\")
    return labels


def _fetch_metrics_text() -> str:
    req = urllib.request.Request(settings.METRICS_ENDPOINT_URL)
    try:
        with urllib.request.urlopen(req, timeout=3.0) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Metrics endpoint HTTP error: {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Metrics endpoint unreachable: {exc.reason}") from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Metrics endpoint timed out") from exc


def _parse_metrics(text: str) -> tuple[dict[str, list[dict]], int]:
    metrics: dict[str, list[dict]] = {}
    parsed_lines = 0

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        match = _METRIC_LINE_RE.match(stripped)
        if not match:
            continue

        name, raw_labels, raw_value = match.groups()
        sample = {
            "labels": _parse_labels(raw_labels),
            "value": _to_float(raw_value),
        }
        metrics.setdefault(name, []).append(sample)
        parsed_lines += 1

    return metrics, parsed_lines


def _first_metric(metrics: dict[str, list[dict]], names: list[str]) -> dict | None:
    for name in names:
        series = metrics.get(name)
        if series:
            return {"name": name, "value": series[0]["value"], "labels": series[0]["labels"]}
    return None


def _metric_samples(metrics: dict[str, list[dict]], name: str) -> list[dict]:
    return metrics.get(name, [])


def _metric_value(metrics: dict[str, list[dict]], name: str, *, labels: dict[str, str] | None = None) -> float | None:
    for sample in metrics.get(name, []):
        if labels and any(sample["labels"].get(k) != v for k, v in labels.items()):
            continue
        return float(sample["value"])
    return None


def _metric_sum(metrics: dict[str, list[dict]], name: str) -> float | None:
    samples = metrics.get(name, [])
    if not samples:
        return None
    return float(sum(float(sample["value"]) for sample in samples))


def _age_from_timestamp_seconds(timestamp: float | None) -> float | None:
    if timestamp is None:
        return None
    return max(0.0, datetime.now(timezone.utc).timestamp() - float(timestamp))


def _gc_quantiles(metrics: dict[str, list[dict]]) -> dict:
    quantiles: dict[str, float] = {}
    for sample in _metric_samples(metrics, "go_gc_duration_seconds"):
        q = sample["labels"].get("quantile")
        if q is None:
            continue
        quantiles[q] = float(sample["value"])

    return {
        "p50": quantiles.get("0.5"),
        "p75": quantiles.get("0.75"),
        "max": quantiles.get("1"),
        "count": _metric_value(metrics, "go_gc_duration_seconds_count"),
        "sum": _metric_value(metrics, "go_gc_duration_seconds_sum"),
    }


def _caddy_runtime(metrics: dict[str, list[dict]]) -> dict:
    upstream_samples = _metric_samples(metrics, "caddy_reverse_proxy_upstreams_healthy")
    healthy = sum(1 for sample in upstream_samples if float(sample["value"]) >= 1.0)
    total = len(upstream_samples)

    return {
        "config_last_reload_successful": _metric_value(metrics, "caddy_config_last_reload_successful"),
        "config_last_reload_timestamp_seconds": _metric_value(metrics, "caddy_config_last_reload_success_timestamp_seconds"),
        "config_last_reload_age_seconds": _age_from_timestamp_seconds(
            _metric_value(metrics, "caddy_config_last_reload_success_timestamp_seconds")
        ),
        "reverse_proxy_upstreams": {
            "total": total,
            "healthy": healthy,
            "unhealthy": max(0, total - healthy),
            "by_upstream": [
                {
                    "upstream": sample["labels"].get("upstream", "unknown"),
                    "healthy": float(sample["value"]) >= 1.0,
                }
                for sample in upstream_samples
            ],
        },
        "admin_http_requests_total": _metric_sum(metrics, "caddy_admin_http_requests_total"),
        "metrics_handler_requests_total": _metric_sum(metrics, "promhttp_metric_handler_requests_total"),
        "requests_in_flight": _metric_value(metrics, "promhttp_metric_handler_requests_in_flight"),
    }


def _go_runtime(metrics: dict[str, list[dict]]) -> dict:
    return {
        "goroutines": _metric_value(metrics, "go_goroutines"),
        "threads": _metric_value(metrics, "go_threads"),
        "gomaxprocs_threads": _metric_value(metrics, "go_sched_gomaxprocs_threads"),
        "gc_pause_seconds": _gc_quantiles(metrics),
        "heap": {
            "alloc_bytes": _metric_value(metrics, "go_memstats_heap_alloc_bytes"),
            "inuse_bytes": _metric_value(metrics, "go_memstats_heap_inuse_bytes"),
            "idle_bytes": _metric_value(metrics, "go_memstats_heap_idle_bytes"),
            "sys_bytes": _metric_value(metrics, "go_memstats_heap_sys_bytes"),
            "objects": _metric_value(metrics, "go_memstats_heap_objects"),
        },
        "alloc_bytes": _metric_value(metrics, "go_memstats_alloc_bytes"),
        "alloc_total_bytes": _metric_value(metrics, "go_memstats_alloc_bytes_total"),
        "mallocs_total": _metric_value(metrics, "go_memstats_mallocs_total"),
        "frees_total": _metric_value(metrics, "go_memstats_frees_total"),
        "next_gc_bytes": _metric_value(metrics, "go_memstats_next_gc_bytes"),
        "last_gc_age_seconds": _age_from_timestamp_seconds(_metric_value(metrics, "go_memstats_last_gc_time_seconds")),
    }


def _process_runtime(metrics: dict[str, list[dict]]) -> dict:
    open_fds = _metric_value(metrics, "process_open_fds")
    max_fds = _metric_value(metrics, "process_max_fds")
    fd_usage_percent = None
    if open_fds is not None and max_fds and max_fds > 0:
        fd_usage_percent = (open_fds / max_fds) * 100

    return {
        "cpu_seconds_total": _metric_value(metrics, "process_cpu_seconds_total"),
        "resident_memory_bytes": _metric_value(metrics, "process_resident_memory_bytes"),
        "virtual_memory_bytes": _metric_value(metrics, "process_virtual_memory_bytes"),
        "virtual_memory_max_bytes": _metric_value(metrics, "process_virtual_memory_max_bytes"),
        "open_fds": open_fds,
        "max_fds": max_fds,
        "fd_usage_percent": fd_usage_percent,
        "network_receive_bytes_total": _metric_value(metrics, "process_network_receive_bytes_total"),
        "network_transmit_bytes_total": _metric_value(metrics, "process_network_transmit_bytes_total"),
        "uptime_seconds": _uptime_seconds(metrics),
    }


def _read_proc_meminfo() -> dict[str, int]:
    meminfo: dict[str, int] = {}
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as fh:
            for line in fh:
                if ":" not in line:
                    continue
                key, value = line.split(":", 1)
                parts = value.strip().split()
                if not parts:
                    continue
                try:
                    amount_kb = int(parts[0])
                except ValueError:
                    continue
                meminfo[key] = amount_kb * 1024
    except OSError:
        return {}
    return meminfo


def _read_proc_loadavg() -> dict:
    try:
        with open("/proc/loadavg", "r", encoding="utf-8") as fh:
            raw = fh.read().strip()
    except OSError:
        return {}

    if not raw:
        return {}

    parts = raw.split()
    if len(parts) < 4:
        return {}

    runnable = None
    processes_total = None
    proc_parts = parts[3].split("/")
    if len(proc_parts) == 2:
        try:
            runnable = int(proc_parts[0])
            processes_total = int(proc_parts[1])
        except ValueError:
            runnable = None
            processes_total = None

    try:
        return {
            "load_1m": float(parts[0]),
            "load_5m": float(parts[1]),
            "load_15m": float(parts[2]),
            "runnable": runnable,
            "processes_total": processes_total,
        }
    except ValueError:
        return {}


def _read_cpu_usage_percent() -> float | None:
    global _LAST_CPU_SNAPSHOT

    try:
        with open("/proc/stat", "r", encoding="utf-8") as fh:
            line = fh.readline().strip()
    except OSError:
        return None

    if not line.startswith("cpu "):
        return None

    parts = line.split()
    try:
        values = [int(value) for value in parts[1:]]
    except ValueError:
        return None

    if len(values) < 5:
        return None

    idle = values[3] + values[4]
    total = sum(values)
    current = (idle, total)

    if _LAST_CPU_SNAPSHOT is None:
        _LAST_CPU_SNAPSHOT = current
        return None

    prev_idle, prev_total = _LAST_CPU_SNAPSHOT
    _LAST_CPU_SNAPSHOT = current

    idle_delta = idle - prev_idle
    total_delta = total - prev_total
    if total_delta <= 0:
        return None

    usage = (1.0 - (idle_delta / total_delta)) * 100.0
    return max(0.0, min(100.0, usage))


def _read_network_totals() -> dict:
    rx_total = 0
    tx_total = 0
    interfaces = []

    try:
        with open("/proc/net/dev", "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return {}

    for line in lines[2:]:
        if ":" not in line:
            continue
        iface, payload = line.split(":", 1)
        fields = payload.split()
        if len(fields) < 9:
            continue
        try:
            rx = int(fields[0])
            tx = int(fields[8])
        except ValueError:
            continue

        iface_name = iface.strip()
        if iface_name == "lo":
            continue

        rx_total += rx
        tx_total += tx
        interfaces.append({"name": iface_name, "rx_bytes": rx, "tx_bytes": tx})

    return {
        "rx_bytes_total": rx_total,
        "tx_bytes_total": tx_total,
        "interfaces": interfaces,
    }


def _read_root_disk_usage() -> dict:
    try:
        stats = os.statvfs("/")
    except OSError:
        return {}

    total = stats.f_frsize * stats.f_blocks
    available = stats.f_frsize * stats.f_bavail
    used = max(0, total - available)
    usage_percent = None
    if total > 0:
        usage_percent = (used / total) * 100.0

    return {
        "mount": "/",
        "total_bytes": total,
        "used_bytes": used,
        "available_bytes": available,
        "usage_percent": usage_percent,
    }


def _os_runtime() -> dict:
    mem = _read_proc_meminfo()
    load = _read_proc_loadavg()
    net = _read_network_totals()

    mem_total = mem.get("MemTotal")
    mem_available = mem.get("MemAvailable")
    mem_used = None
    mem_used_percent = None
    if mem_total is not None and mem_available is not None:
        mem_used = max(0, mem_total - mem_available)
        if mem_total > 0:
            mem_used_percent = (mem_used / mem_total) * 100.0

    swap_total = mem.get("SwapTotal")
    swap_free = mem.get("SwapFree")
    swap_used = None
    swap_used_percent = None
    if swap_total is not None and swap_free is not None:
        swap_used = max(0, swap_total - swap_free)
        if swap_total > 0:
            swap_used_percent = (swap_used / swap_total) * 100.0

    return {
        "cpu": {
            "cores": os.cpu_count(),
            "usage_percent": _read_cpu_usage_percent(),
            "load": load,
        },
        "memory": {
            "total_bytes": mem_total,
            "available_bytes": mem_available,
            "used_bytes": mem_used,
            "used_percent": mem_used_percent,
            "swap_total_bytes": swap_total,
            "swap_used_bytes": swap_used,
            "swap_used_percent": swap_used_percent,
        },
        "disk": {
            "root": _read_root_disk_usage(),
        },
        "network": net,
        "source": "linux-procfs",
    }


def _backend_runtime() -> dict:
    snapshot = internal_metrics.snapshot()
    error_rate = 0.0
    if snapshot.requests_total > 0:
        error_rate = (snapshot.status_5xx / snapshot.requests_total) * 100.0

    return {
        "uptime_seconds": snapshot.uptime_seconds,
        "active_requests": snapshot.active_requests,
        "requests_total": snapshot.requests_total,
        "status_2xx": snapshot.status_2xx,
        "status_4xx": snapshot.status_4xx,
        "status_5xx": snapshot.status_5xx,
        "error_rate_percent": error_rate,
        "avg_latency_ms": snapshot.avg_latency_ms,
        "p95_latency_ms": snapshot.p95_latency_ms,
    }


def _read_text(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return None


def _parse_cgroup_limit(value: str | None) -> int | None:
    if not value:
        return None
    raw = value.strip()
    if raw in {"", "max"}:
        return None
    try:
        parsed = int(raw)
    except ValueError:
        return None
    if parsed <= 0 or parsed >= (1 << 60):
        return None
    return parsed


def _container_context() -> dict:
    marker_docker = os.path.exists("/.dockerenv")
    marker_podman = os.path.exists("/run/.containerenv")
    cgroup_text = _read_text("/proc/1/cgroup") or ""

    runtime = "host"
    if marker_podman:
        runtime = "podman"
    elif marker_docker:
        runtime = "docker"
    elif "kubepods" in cgroup_text:
        runtime = "kubernetes"
    elif cgroup_text and "0::/" not in cgroup_text:
        runtime = "container"

    cgroup_v2 = os.path.exists("/sys/fs/cgroup/cgroup.controllers")

    memory_limit_bytes = None
    if cgroup_v2:
        memory_limit_bytes = _parse_cgroup_limit(_read_text("/sys/fs/cgroup/memory.max"))
    if memory_limit_bytes is None:
        memory_limit_bytes = _parse_cgroup_limit(_read_text("/sys/fs/cgroup/memory/memory.limit_in_bytes"))

    cpu_limit_cores = None
    if cgroup_v2:
        cpu_max = _read_text("/sys/fs/cgroup/cpu.max")
        if cpu_max:
            parts = cpu_max.split()
            if len(parts) >= 2 and parts[0] != "max":
                try:
                    quota = int(parts[0])
                    period = int(parts[1])
                    if quota > 0 and period > 0:
                        cpu_limit_cores = quota / period
                except ValueError:
                    cpu_limit_cores = None
    if cpu_limit_cores is None:
        quota = _parse_cgroup_limit(_read_text("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"))
        period = _parse_cgroup_limit(_read_text("/sys/fs/cgroup/cpu/cpu.cfs_period_us"))
        if quota and period:
            cpu_limit_cores = quota / period

    return {
        "is_containerized": runtime != "host",
        "runtime": runtime,
        "cgroup_version": 2 if cgroup_v2 else 1,
        "memory_limit_bytes": memory_limit_bytes,
        "cpu_limit_cores": cpu_limit_cores,
    }


def _database_context() -> dict:
    url = (settings.DATABASE_URL or "").strip()
    if not url:
        return {"engine": None, "target": None, "size_bytes": None}

    parsed = urlparse(url)
    engine = parsed.scheme
    target = None
    size_bytes = None

    if engine.startswith("sqlite"):
        if url.startswith("sqlite:////"):
            db_path = Path(url.removeprefix("sqlite:///"))
        else:
            db_path = Path(url.removeprefix("sqlite:///"))
            if not db_path.is_absolute():
                db_path = Path.cwd() / db_path

        target = str(db_path)
        try:
            size_bytes = db_path.stat().st_size
        except OSError:
            size_bytes = None
    else:
        target = parsed.hostname or parsed.path or "unknown"

    return {
        "engine": engine,
        "target": target,
        "size_bytes": size_bytes,
    }


def _mask_key(value: str | None) -> str | None:
    if not value:
        return value
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def _wireguard_runtime() -> dict:
    try:
        raw = wireguard_service.get_interface_summary()
    except Exception:
        return {
            "available": False,
            "interface": settings.WG_INTERFACE,
            "is_up": False,
            "error": "wireguard introspection unavailable",
        }

    latest_handshake = raw.get("latest_handshake")
    latest_handshake_age_seconds = None
    latest_handshake_iso = None
    if latest_handshake:
        latest_handshake_iso = latest_handshake.isoformat()
        latest_handshake_age_seconds = max(
            0.0,
            datetime.now(timezone.utc).timestamp() - latest_handshake.timestamp(),
        )

    return {
        "available": True,
        "interface": raw.get("interface"),
        "is_up": raw.get("is_up"),
        "listen_port": raw.get("listen_port"),
        "public_key": _mask_key(raw.get("public_key")),
        "configured_peers": raw.get("configured_peers"),
        "connected_peers": raw.get("connected_peers"),
        "latest_handshake": latest_handshake_iso,
        "latest_handshake_age_seconds": latest_handshake_age_seconds,
        "transfer_rx": raw.get("transfer_rx"),
        "transfer_tx": raw.get("transfer_tx"),
    }


def _environment_context() -> dict:
    snapshot = internal_metrics.snapshot()
    started_at_iso = datetime.fromtimestamp(snapshot.started_at, tz=timezone.utc).isoformat()
    return {
        "app": {
            "version": settings.APP_VERSION,
            "commit": os.getenv("GIT_COMMIT", "unknown"),
            "started_at": started_at_iso,
            "pid": os.getpid(),
        },
        "host": {
            "hostname": socket.gethostname(),
            "platform": platform.system(),
            "kernel": platform.release(),
            "architecture": platform.machine(),
            "cpu_cores": os.cpu_count(),
            "python_version": sys.version.split()[0],
        },
        "container": _container_context(),
        "database": _database_context(),
    }


def _probe_source(url: str, timeout_seconds: float = 3.0) -> dict:
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            return {
                "available": 200 <= response.status < 400,
                "status_code": response.status,
                "error": None,
            }
    except urllib.error.HTTPError as exc:
        return {
            "available": False,
            "status_code": exc.code,
            "error": f"http {exc.code}",
        }
    except Exception as exc:
        return {
            "available": False,
            "status_code": None,
            "error": str(exc),
        }


def _probe_endpoint_detail(
    url: str,
    *,
    timeout_seconds: float = 3.0,
    expect_json: bool = False,
    name: str | None = None,
) -> dict:
    endpoint = (url or "").strip()
    if not endpoint:
        return {
            "name": name or "endpoint",
            "url": endpoint,
            "available": False,
            "status_code": None,
            "latency_ms": None,
            "content_type": None,
            "response_bytes": 0,
            "json": None,
            "error": "not configured",
        }

    started = time.monotonic()
    req = urllib.request.Request(endpoint)
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            body = response.read()
            latency_ms = (time.monotonic() - started) * 1000.0
            observed_at = datetime.now(timezone.utc).isoformat()
            content_type = response.headers.get("Content-Type")
            json_shape = None
            parse_error = None
            if expect_json:
                try:
                    parsed_json = json.loads(body.decode("utf-8", errors="replace"))
                    if isinstance(parsed_json, dict):
                        json_shape = {
                            "kind": "object",
                            "keys": sorted(list(parsed_json.keys()))[:20],
                            "key_count": len(parsed_json),
                        }
                    elif isinstance(parsed_json, list):
                        json_shape = {
                            "kind": "array",
                            "length": len(parsed_json),
                        }
                    else:
                        json_shape = {
                            "kind": type(parsed_json).__name__,
                        }
                except json.JSONDecodeError:
                    parse_error = "invalid-json"

            return {
                "name": name or "endpoint",
                "url": endpoint,
                "available": 200 <= response.status < 400,
                "status_code": response.status,
                "latency_ms": latency_ms,
                "observed_at": observed_at,
                "content_type": content_type,
                "response_bytes": len(body),
                "json_shape": json_shape,
                "error": parse_error,
            }
    except urllib.error.HTTPError as exc:
        return {
            "name": name or "endpoint",
            "url": endpoint,
            "available": False,
            "status_code": exc.code,
            "latency_ms": (time.monotonic() - started) * 1000.0,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "content_type": None,
            "response_bytes": 0,
            "json_shape": None,
            "error": f"http {exc.code}",
        }
    except Exception as exc:
        return {
            "name": name or "endpoint",
            "url": endpoint,
            "available": False,
            "status_code": None,
            "latency_ms": (time.monotonic() - started) * 1000.0,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "content_type": None,
            "response_bytes": 0,
            "json_shape": None,
            "error": str(exc),
        }


def _api_probe_summary(probes: list[dict]) -> dict:
    total = len(probes)
    healthy = sum(1 for probe in probes if probe.get("available"))
    latencies = [float(probe["latency_ms"]) for probe in probes if probe.get("latency_ms") is not None]
    avg_latency_ms = sum(latencies) / len(latencies) if latencies else None
    return {
        "healthy": healthy,
        "total": total,
        "coverage_percent": ((healthy / total) * 100.0) if total > 0 else 0.0,
        "avg_latency_ms": avg_latency_ms,
    }


def _build_sidecar_payload(base: dict, probes: list[dict]) -> dict:
    payload = dict(base)
    payload.setdefault("observed_at", datetime.now(timezone.utc).isoformat())
    payload["api_probes"] = probes
    payload["api_probe_summary"] = _api_probe_summary(probes)
    payload["api_capability_count"] = len(probes)
    return payload


def _parse_host_port(address: str) -> tuple[str | None, int | None]:
    value = (address or "").strip()
    if not value:
        return None, None

    # Accept either host:port or URL format.
    if "://" in value:
        parsed = urlparse(value)
        return parsed.hostname, parsed.port

    if ":" not in value:
        return None, None

    host, raw_port = value.rsplit(":", 1)
    host = host.strip()
    try:
        port = int(raw_port)
    except ValueError:
        return None, None
    if not host or port <= 0 or port > 65535:
        return None, None
    return host, port


def _tcp_reachable(host: str | None, port: int | None, timeout_seconds: float = 1.5) -> bool:
    if not host or not port:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            return True
    except OSError:
        return False


def _process_cmdline_contains(needle: str) -> bool:
    target = needle.strip().lower()
    if not target:
        return False

    proc = Path("/proc")
    if not proc.exists():
        return False

    for entry in proc.iterdir():
        if not entry.is_dir() or not entry.name.isdigit():
            continue
        try:
            cmdline = (entry / "cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", errors="ignore").lower()
        except OSError:
            continue
        if target in cmdline:
            return True
    return False


def _ebpf_delivery_probe(endpoint: str) -> dict:
    http_probe = _probe_source(endpoint)
    if http_probe["available"]:
        return {
            **http_probe,
            "mode": "http-metrics",
        }

    remote_host, remote_port = _parse_host_port(settings.PARCA_REMOTE_STORE_ADDRESS)
    remote_reachable = _tcp_reachable(remote_host, remote_port)
    agent_running = _process_cmdline_contains("parca-agent")
    delivery_ok = agent_running and remote_reachable

    return {
        "available": delivery_ok,
        "status_code": http_probe["status_code"],
        "error": None if delivery_ok else (
            f"{http_probe.get('error')}; delivery agent_running={agent_running} remote_reachable={remote_reachable}"
        ),
        "mode": "delivery-health",
        "agent_running": agent_running,
        "remote_store": settings.PARCA_REMOTE_STORE_ADDRESS,
        "remote_reachable": remote_reachable,
    }


def _source_probes() -> list[dict]:
    configured = [
        ("node-exporter", settings.NODE_EXPORTER_ENDPOINT_URL),
        ("podman-exporter", settings.PODMAN_EXPORTER_ENDPOINT_URL),
        ("postgres-exporter", settings.POSTGRES_EXPORTER_ENDPOINT_URL),
        ("parca-server", settings.PARCA_SERVER_ENDPOINT_URL),
        ("ebpf", settings.EBPF_EXPORTER_ENDPOINT_URL),
        ("falcosidekick", settings.FALCOSIDEKICK_ENDPOINT_URL),
        ("crowdsec", settings.CROWDSEC_ENDPOINT_URL),
        ("trivy-server", settings.TRIVY_SERVER_ENDPOINT_URL),
        ("wazuh-api", settings.WAZUH_API_ENDPOINT_URL),
        ("fleet-api", settings.FLEET_API_ENDPOINT_URL),
        ("osquery-exporter", settings.OSQUERY_EXPORTER_ENDPOINT_URL),
    ]

    probes: list[dict] = []
    for source_id, url in configured:
        endpoint = (url or "").strip()
        if not endpoint:
            # Skip optional probes that are not configured so UI only shows active sources.
            continue

        if source_id == "ebpf":
            probe = _ebpf_delivery_probe(endpoint)
        else:
            probe = _probe_source(endpoint)
        probes.append(
            {
                "id": source_id,
                "configured": True,
                "url": endpoint,
                **probe,
            }
        )

    return probes


def _fetch_endpoint_text(url: str, timeout_seconds: float = 3.0) -> str | None:
    endpoint = (url or "").strip()
    if not endpoint:
        return None
    req = urllib.request.Request(endpoint)
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def _fetch_endpoint_json(url: str, timeout_seconds: float = 3.0) -> dict | None:
    body = _fetch_endpoint_text(url, timeout_seconds=timeout_seconds)
    if not body:
        return None
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def _safe_metric(metrics: dict[str, list[dict]], name: str, labels: dict[str, str] | None = None) -> float | None:
    try:
        return _metric_value(metrics, name, labels=labels)
    except Exception:
        return None


def _safe_metric_sum(metrics: dict[str, list[dict]], name: str) -> float | None:
    try:
        return _metric_sum(metrics, name)
    except Exception:
        return None


def _node_exporter_runtime() -> dict:
    text = _fetch_endpoint_text(settings.NODE_EXPORTER_ENDPOINT_URL)
    if not text:
        return {"available": False}

    parsed, _ = _parse_metrics(text)
    mem_total = _safe_metric(parsed, "node_memory_MemTotal_bytes")
    mem_available = _safe_metric(parsed, "node_memory_MemAvailable_bytes")
    mem_used_percent = None
    if mem_total and mem_total > 0 and mem_available is not None:
        mem_used_percent = ((mem_total - mem_available) / mem_total) * 100.0

    root_available = _safe_metric(parsed, "node_filesystem_avail_bytes", labels={"mountpoint": "/"})
    root_size = _safe_metric(parsed, "node_filesystem_size_bytes", labels={"mountpoint": "/"})
    root_used_percent = None
    if root_size and root_size > 0 and root_available is not None:
        root_used_percent = ((root_size - root_available) / root_size) * 100.0

    net_rx = 0.0
    net_tx = 0.0
    active_devices: set[str] = set()
    for sample in parsed.get("node_network_receive_bytes_total", []):
        device = sample["labels"].get("device")
        if device in {"", "lo", None, "docker0"}:
            continue
        value = float(sample["value"])
        if value > 0:
            active_devices.add(device)
        net_rx += value

    for sample in parsed.get("node_network_transmit_bytes_total", []):
        device = sample["labels"].get("device")
        if device in {"", "lo", None, "docker0"}:
            continue
        value = float(sample["value"])
        if value > 0:
            active_devices.add(device)
        net_tx += value

    payload = {
        "available": True,
        "load1": _safe_metric(parsed, "node_load1"),
        "load5": _safe_metric(parsed, "node_load5"),
        "mem_total_bytes": mem_total,
        "mem_available_bytes": mem_available,
        "mem_used_percent": mem_used_percent,
        "root_total_bytes": root_size,
        "root_available_bytes": root_available,
        "root_used_percent": root_used_percent,
        "network_rx_bytes_total": net_rx,
        "network_tx_bytes_total": net_tx,
        "active_devices": sorted(active_devices),
    }
    probes = [
        _probe_endpoint_detail(settings.NODE_EXPORTER_ENDPOINT_URL, name="metrics"),
    ]
    return _build_sidecar_payload(payload, probes)


def _podman_exporter_runtime() -> dict:
    text = _fetch_endpoint_text(settings.PODMAN_EXPORTER_ENDPOINT_URL)
    if not text:
        return {"available": False}

    parsed, _ = _parse_metrics(text)
    running = 0
    exited = 0
    other_states = 0
    for sample in parsed.get("podman_container_state", []):
        state = int(float(sample["value"]))
        if state == 2:
            running += 1
        elif state == 5:
            exited += 1
        else:
            other_states += 1

    payload = {
        "available": True,
        "containers_running": running,
        "containers_exited": exited,
        "containers_other": other_states,
        "container_mem_usage_bytes": _safe_metric_sum(parsed, "podman_container_mem_usage_bytes"),
        "container_cpu_system_seconds_total": _safe_metric_sum(parsed, "podman_container_cpu_system_seconds_total"),
    }
    probes = [
        _probe_endpoint_detail(settings.PODMAN_EXPORTER_ENDPOINT_URL, name="metrics"),
    ]
    return _build_sidecar_payload(payload, probes)


def _postgres_exporter_runtime() -> dict:
    text = _fetch_endpoint_text(settings.POSTGRES_EXPORTER_ENDPOINT_URL)
    if not text:
        return {"available": False}

    parsed, _ = _parse_metrics(text)
    blks_hit = _safe_metric(parsed, "pg_stat_database_blks_hit", labels={"datname": settings.POSTGRES_DB})
    blks_read = _safe_metric(parsed, "pg_stat_database_blks_read", labels={"datname": settings.POSTGRES_DB})
    cache_hit_percent = None
    if blks_hit is not None and blks_read is not None and (blks_hit + blks_read) > 0:
        cache_hit_percent = (blks_hit / (blks_hit + blks_read)) * 100.0

    payload = {
        "available": True,
        "up": _safe_metric(parsed, "pg_up"),
        "database_size_bytes": _safe_metric(parsed, "pg_database_size_bytes", labels={"datname": settings.POSTGRES_DB}),
        "num_backends": _safe_metric(parsed, "pg_stat_database_numbackends", labels={"datname": settings.POSTGRES_DB}),
        "xact_commit_total": _safe_metric(parsed, "pg_stat_database_xact_commit", labels={"datname": settings.POSTGRES_DB}),
        "xact_rollback_total": _safe_metric(parsed, "pg_stat_database_xact_rollback", labels={"datname": settings.POSTGRES_DB}),
        "cache_hit_percent": cache_hit_percent,
    }
    probes = [
        _probe_endpoint_detail(settings.POSTGRES_EXPORTER_ENDPOINT_URL, name="metrics"),
    ]
    return _build_sidecar_payload(payload, probes)


def _falcosidekick_runtime() -> dict:
    text = _fetch_endpoint_text(settings.FALCOSIDEKICK_ENDPOINT_URL)
    if not text:
        return {"available": False}

    parsed, _ = _parse_metrics(text)
    input_total = _safe_metric_sum(parsed, "falcosidekick_inputs") or 0.0
    rejected = 0.0
    for sample in parsed.get("falcosidekick_inputs", []):
        if sample["labels"].get("status") == "rejected":
            rejected += float(sample["value"])

    rejection_percent = None
    if input_total > 0:
        rejection_percent = (rejected / input_total) * 100.0

    payload = {
        "available": True,
        "inputs_total": input_total,
        "inputs_rejected": rejected,
        "rejection_percent": rejection_percent,
        "goroutines": _safe_metric(parsed, "go_goroutines"),
        "resident_memory_bytes": _safe_metric(parsed, "process_resident_memory_bytes"),
    }
    probes = [
        _probe_endpoint_detail(settings.FALCOSIDEKICK_ENDPOINT_URL, name="metrics"),
    ]
    return _build_sidecar_payload(payload, probes)


def _parca_runtime() -> dict:
    text = _fetch_endpoint_text(f"{settings.PARCA_SERVER_ENDPOINT_URL.rstrip('/')}/metrics")
    if not text:
        return {"available": False}

    parsed, _ = _parse_metrics(text)
    lsm_size = _safe_metric_sum(parsed, "frostdb_lsm_level_size_bytes")
    cache_hit = _safe_metric(parsed, "cache_requests_total", labels={"result": "hit"})
    cache_miss = _safe_metric(parsed, "cache_requests_total", labels={"result": "miss"})
    cache_hit_percent = None
    if cache_hit is not None and cache_miss is not None and (cache_hit + cache_miss) > 0:
        cache_hit_percent = (cache_hit / (cache_hit + cache_miss)) * 100.0

    grpc_write_ok = _safe_metric(parsed, "grpc_server_handled_total", labels={
        "grpc_method": "WriteRaw",
        "grpc_code": "OK",
    })

    payload = {
        "available": True,
        "go_goroutines": _safe_metric(parsed, "go_goroutines"),
        "resident_memory_bytes": _safe_metric(parsed, "process_resident_memory_bytes"),
        "frostdb_lsm_size_bytes": lsm_size,
        "debuginfod_cache_hit_percent": cache_hit_percent,
        "grpc_write_raw_ok_total": grpc_write_ok,
    }
    base = settings.PARCA_SERVER_ENDPOINT_URL.rstrip("/")
    probes = [
        _probe_endpoint_detail(f"{base}/metrics", name="metrics"),
        _probe_endpoint_detail(f"{base}/-/healthy", name="health"),
    ]
    return _build_sidecar_payload(payload, probes)


def _extract_go_build_version(metrics: dict[str, list[dict]]) -> str | None:
    for sample in metrics.get("go_build_info", []):
        version = sample["labels"].get("version")
        if version:
            return version
    return None


def _ebpf_agent_runtime() -> dict:
    text = _fetch_endpoint_text(settings.EBPF_EXPORTER_ENDPOINT_URL)
    if not text:
        return {"available": False}

    parsed, _ = _parse_metrics(text)
    payload = {
        "available": True,
        "version": _extract_go_build_version(parsed),
        "go_goroutines": _safe_metric(parsed, "go_goroutines"),
        "resident_memory_bytes": _safe_metric(parsed, "process_resident_memory_bytes"),
        "debuginfo_upload_request_bytes": _safe_metric(parsed, "debuginfo_upload_request_bytes"),
    }
    probes = [
        _probe_endpoint_detail(settings.EBPF_EXPORTER_ENDPOINT_URL, name="metrics"),
    ]
    return _build_sidecar_payload(payload, probes)


def _crowdsec_runtime() -> dict:
    payload = _fetch_endpoint_json(settings.CROWDSEC_ENDPOINT_URL)
    if not payload:
        probe = _probe_endpoint_detail(settings.CROWDSEC_ENDPOINT_URL, expect_json=True, name="health")
        return _build_sidecar_payload({"available": False}, [probe])
    status = str(payload.get("status") or "unknown").lower()
    sidecar_payload = {
        "available": True,
        "status": status,
        "healthy": status == "up",
    }
    probes = [
        _probe_endpoint_detail(settings.CROWDSEC_ENDPOINT_URL, expect_json=True, name="health"),
    ]
    return _build_sidecar_payload(sidecar_payload, probes)


def _trivy_runtime() -> dict:
    payload = _fetch_endpoint_json(settings.TRIVY_SERVER_ENDPOINT_URL)
    if not payload:
        probes = [
            _probe_endpoint_detail(settings.TRIVY_SERVER_ENDPOINT_URL, expect_json=True, name="version"),
        ]
        return _build_sidecar_payload({"available": False}, probes)

    db = payload.get("VulnerabilityDB") or {}
    updated_at = db.get("UpdatedAt")
    next_update = db.get("NextUpdate")
    updated_age_hours = None
    try:
        if updated_at:
            updated_dt = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
            updated_age_hours = max(0.0, (datetime.now(timezone.utc) - updated_dt).total_seconds() / 3600.0)
    except Exception:
        updated_age_hours = None

    sidecar_payload = {
        "available": True,
        "version": payload.get("Version"),
        "db_version": db.get("Version"),
        "db_updated_at": updated_at,
        "db_next_update": next_update,
        "db_age_hours": updated_age_hours,
    }
    parsed = urlparse(settings.TRIVY_SERVER_ENDPOINT_URL)
    base = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else settings.TRIVY_SERVER_ENDPOINT_URL.rstrip("/")
    probes = [
        _probe_endpoint_detail(settings.TRIVY_SERVER_ENDPOINT_URL, expect_json=True, name="version"),
        _probe_endpoint_detail(f"{base}/health", expect_json=False, name="health"),
    ]
    return _build_sidecar_payload(sidecar_payload, probes)


def _optional_api_sidecar_runtime(endpoint_url: str, probe_name: str = "api") -> dict:
    endpoint = (endpoint_url or "").strip()
    if not endpoint:
        return {
            "configured": False,
            "available": False,
            "api_capability_count": 0,
            "api_probes": [],
            "api_probe_summary": {
                "healthy": 0,
                "total": 0,
                "coverage_percent": 0.0,
                "avg_latency_ms": None,
            },
        }

    probe = _probe_endpoint_detail(endpoint, expect_json=True, name=probe_name)
    return _build_sidecar_payload(
        {
            "configured": True,
            "available": probe.get("available", False),
        },
        [probe],
    )


def _cached_sidecar_probe(sidecar_id: str, probe_fn) -> dict:
    now = time.monotonic()
    now_iso = datetime.now(timezone.utc).isoformat()
    ttl = float(_SIDECAR_TTL_SECONDS.get(sidecar_id, 30.0))
    entry = _SIDECAR_CACHE.get(sidecar_id)
    if entry and entry.get("expires_at", 0.0) > now:
        payload = dict(entry["payload"])
        payload["cache_age_seconds"] = max(0.0, now - float(entry.get("fetched_at", now)))
        payload["cache_ttl_seconds"] = ttl
        payload["cache_state"] = "hit"
        payload["cache_served_at"] = now_iso
        return payload

    payload = probe_fn()
    # Failed probes get a shorter retry interval so recovery is detected quickly.
    effective_ttl = ttl if payload.get("available") else min(20.0, ttl)
    _SIDECAR_CACHE[sidecar_id] = {
        "payload": payload,
        "fetched_at": now,
        "fetched_at_iso": now_iso,
        "expires_at": now + effective_ttl,
    }

    fresh_payload = dict(payload)
    fresh_payload["cache_age_seconds"] = 0.0
    fresh_payload["cache_ttl_seconds"] = effective_ttl
    fresh_payload["cache_state"] = "miss"
    fresh_payload["cache_served_at"] = now_iso
    return fresh_payload


def _sidecar_runtime() -> dict:
    return {
        "node_exporter": _cached_sidecar_probe("node_exporter", _node_exporter_runtime),
        "podman_exporter": _cached_sidecar_probe("podman_exporter", _podman_exporter_runtime),
        "postgres_exporter": _cached_sidecar_probe("postgres_exporter", _postgres_exporter_runtime),
        "falcosidekick": _cached_sidecar_probe("falcosidekick", _falcosidekick_runtime),
        "parca": _cached_sidecar_probe("parca", _parca_runtime),
        "ebpf_agent": _cached_sidecar_probe("ebpf_agent", _ebpf_agent_runtime),
        "crowdsec": _cached_sidecar_probe("crowdsec", _crowdsec_runtime),
        "trivy_server": _cached_sidecar_probe("trivy_server", _trivy_runtime),
        "wazuh_api": _optional_api_sidecar_runtime(settings.WAZUH_API_ENDPOINT_URL),
        "fleet_api": _optional_api_sidecar_runtime(settings.FLEET_API_ENDPOINT_URL),
        "osquery_exporter": _optional_api_sidecar_runtime(settings.OSQUERY_EXPORTER_ENDPOINT_URL),
    }


def _uptime_seconds(metrics: dict[str, list[dict]]) -> float | None:
    start = _first_metric(metrics, ["process_start_time_seconds"])
    if not start:
        return None
    now = datetime.now(timezone.utc).timestamp()
    return max(0.0, now - float(start["value"]))


@router.get("/metrics/summary")
async def metrics_summary():
    text = _fetch_metrics_text()
    metrics, parsed_lines = _parse_metrics(text)

    highlights = {
        "up": _first_metric(metrics, ["up"]),
        "requests_in_flight": _first_metric(metrics, [
            "caddy_http_requests_in_flight",
            "promhttp_metric_handler_requests_in_flight",
        ]),
        "go_goroutines": _first_metric(metrics, ["go_goroutines"]),
        "go_threads": _first_metric(metrics, ["go_threads"]),
        "resident_memory_bytes": _first_metric(metrics, ["process_resident_memory_bytes"]),
        "open_fds": _first_metric(metrics, ["process_open_fds"]),
        "max_fds": _first_metric(metrics, ["process_max_fds"]),
        "uptime_seconds": {
            "name": "process_start_time_seconds",
            "value": _uptime_seconds(metrics),
            "labels": {},
        },
    }

    catalog = [
        {
            "id": name,
            "name": name,
            "series": len(series),
            "sample_value": series[0]["value"] if series else None,
        }
        for name, series in sorted(metrics.items())
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": settings.METRICS_ENDPOINT_URL,
        "sources": [
            "caddy-prometheus",
            "go-runtime",
            "process-exporter",
            "backend-internal",
            "linux-procfs",
            "wireguard-runtime",
            "environment-context",
            "parca-profiles",
        ],
        "source_probes": _source_probes(),
        "summary": {
            "metric_names": len(metrics),
            "series": sum(len(series) for series in metrics.values()),
            "parsed_lines": parsed_lines,
        },
        "runtime": {
            "caddy": _caddy_runtime(metrics),
            "go": _go_runtime(metrics),
            "process": _process_runtime(metrics),
            "backend": _backend_runtime(),
            "os": _os_runtime(),
            "wireguard": _wireguard_runtime(),
            "environment": _environment_context(),
            "sidecars": _sidecar_runtime(),
        },
        "highlights": highlights,
        "catalog": catalog,
    }
