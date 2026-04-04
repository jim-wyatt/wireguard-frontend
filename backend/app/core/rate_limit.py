from collections import defaultdict, deque
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from threading import Lock

from fastapi import HTTPException, Request, status


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[datetime]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=window_seconds)

        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded",
                )

            bucket.append(now)


_limiter = InMemoryRateLimiter()


def per_ip_limit(limit: int, window_seconds: int = 60) -> Callable[[Request], None]:
    async def dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        _limiter.check(f"{client_ip}:{path}", limit=limit, window_seconds=window_seconds)

    return dependency
