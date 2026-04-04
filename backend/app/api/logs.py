import asyncio
import logging
import os
from collections import deque
from enum import Enum
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class LogSource(str, Enum):
    CADDY = "caddy"
    APP = "app"
    SYSTEM = "system"


def _path_for_source(source: LogSource) -> tuple[str, str]:
    if source == LogSource.CADDY:
        return settings.CADDY_ACCESS_LOG_PATH, "Caddy access log"
    if source == LogSource.APP:
        return settings.APP_LOG_PATH, "Application log"
    return settings.SYSTEM_LOG_PATH, "System log"


async def _stream_log_file(
    request: Request,
    log_path: str,
    tail: int,
    source_label: str,
    follow: bool,
) -> StreamingResponse:
    if not os.path.isfile(log_path):
        raise HTTPException(status_code=404, detail=f"{source_label} file not found")

    async def iter_log_lines() -> AsyncIterator[str]:
        try:
            with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
                if tail > 0:
                    for line in deque(handle, maxlen=tail):
                        yield line if line.endswith("\n") else f"{line}\n"

                if not follow:
                    return

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
            logger.exception("Error while streaming %s", source_label)
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


@router.get("/logs/stream")
async def stream_logs(
    request: Request,
    source: LogSource = Query(default=LogSource.CADDY),
    tail: int = Query(default=100, ge=0, le=2000),
    follow: bool = Query(default=True),
):
    """Stream log lines from supported sources as plain-text chunks."""
    log_path, source_label = _path_for_source(source)
    return await _stream_log_file(
        request=request,
        log_path=log_path,
        tail=tail,
        source_label=source_label,
        follow=follow,
    )


@router.get("/logs/caddy/access/stream")
async def stream_caddy_access_log(
    request: Request,
    tail: int = Query(default=100, ge=0, le=2000),
    follow: bool = Query(default=True),
):
    """Backward-compatible caddy access log stream endpoint."""
    return await _stream_log_file(
        request=request,
        log_path=settings.CADDY_ACCESS_LOG_PATH,
        tail=tail,
        source_label="Caddy access log",
        follow=follow,
    )
