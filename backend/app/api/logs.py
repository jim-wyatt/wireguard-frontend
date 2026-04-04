import asyncio
import logging
import os
from collections import deque
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.auth import require_writer_role
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/logs/caddy/access/stream")
async def stream_caddy_access_log(
    request: Request,
    tail: int = Query(default=100, ge=0, le=2000),
    _: None = Depends(require_writer_role),
):
    """Stream Caddy access log lines as plain-text chunks."""
    log_path = settings.CADDY_ACCESS_LOG_PATH

    if not os.path.isfile(log_path):
        raise HTTPException(status_code=404, detail="Caddy access log file not found")

    async def iter_log_lines() -> AsyncIterator[str]:
        try:
            with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
                if tail > 0:
                    for line in deque(handle, maxlen=tail):
                        yield line if line.endswith("\n") else f"{line}\n"

                handle.seek(0, os.SEEK_END)

                while True:
                    if await request.is_disconnected():
                        break

                    current_pos = handle.tell()
                    line = handle.readline()
                    if line:
                        yield line if line.endswith("\n") else f"{line}\n"
                        continue

                    # Handle truncation or rotation.
                    try:
                        disk_stat = os.stat(log_path)
                        file_stat = os.fstat(handle.fileno())
                        if disk_stat.st_ino != file_stat.st_ino or disk_stat.st_size < current_pos:
                            handle.seek(0)
                    except FileNotFoundError:
                        # The file may be momentarily unavailable during rotation.
                        pass

                    await asyncio.sleep(0.5)
        except Exception:
            logger.exception("Error while streaming Caddy access log")
            yield "[log-stream-error] Failed to continue streaming logs\n"

    return StreamingResponse(
        iter_log_lines(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
