import asyncio
import fcntl
import os
import pty
import select
import shutil
import struct
import subprocess
import termios
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.core.auth import require_api_auth

router = APIRouter()

_COLUMNS = 214
_ROWS = 52
# How long to wait for btop to render its first full frame (seconds)
_CAPTURE_SECONDS = 2.2


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)


def _run_btop_pty() -> str:
    """
    Spawn btop inside a pseudo-terminal, capture the first rendered frame,
    then kill the process. Returns the raw ANSI byte string decoded as UTF-8.
    """
    btop_path = shutil.which("btop")
    if not btop_path:
        return "\x1b[31mbtop not found in PATH — container may need rebuilding\x1b[0m"

    master_fd, slave_fd = pty.openpty()
    try:
        _set_winsize(slave_fd, _ROWS, _COLUMNS)

        env = {
            **os.environ,
            "TERM": "xterm-256color",
            "LINES": str(_ROWS),
            "COLUMNS": str(_COLUMNS),
            "HOME": "/tmp",
        }

        proc = subprocess.Popen(
            [btop_path, "--utf-force", "--update", "2000"],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            env=env,
        )
    finally:
        os.close(slave_fd)

    output = bytearray()
    deadline = time.monotonic() + _CAPTURE_SECONDS
    try:
        while time.monotonic() < deadline:
            remaining = max(0.05, deadline - time.monotonic())
            r, _, _ = select.select([master_fd], [], [], remaining)
            if r:
                try:
                    chunk = os.read(master_fd, 65536)
                    output.extend(chunk)
                except OSError:
                    break
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=1.5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        try:
            os.close(master_fd)
        except OSError:
            pass

    return output.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/debug/btop/snapshot", dependencies=[Depends(require_api_auth)])
async def system_snapshot() -> dict:
    loop = asyncio.get_running_loop()
    ansi_text = await loop.run_in_executor(None, _run_btop_pty)
    return {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "refresh_hint_seconds": 5,
        "viewport": {
            "columns": _COLUMNS,
            "rows": _ROWS,
        },
        "ansi_text": ansi_text,
    }


