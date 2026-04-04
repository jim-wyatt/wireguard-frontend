import secrets
from enum import Enum
from datetime import datetime, timedelta, timezone
from collections import defaultdict, deque
from threading import Lock

from fastapi import Header, HTTPException, Request, status

from app.core.config import settings


DEFAULT_INSECURE_SECRET = "change-this-secret-key"


class Role(str, Enum):
    PUBLIC = "public"
    WRITER = "writer"


_auth_fail_lock = Lock()
_auth_fail_hits: dict[str, deque[datetime]] = defaultdict(deque)
_auth_blocked_until: dict[str, datetime] = {}


def _record_auth_failure(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=60)

    with _auth_fail_lock:
        bucket = _auth_fail_hits[client_ip]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        bucket.append(now)

        if len(bucket) >= settings.AUTH_FAIL_RATE_LIMIT_PER_MINUTE:
            _auth_blocked_until[client_ip] = now + timedelta(seconds=settings.AUTH_FAIL_BLOCK_SECONDS)
            bucket.clear()


def _is_ip_blocked(client_ip: str) -> bool:
    now = datetime.now(timezone.utc)
    with _auth_fail_lock:
        blocked_until = _auth_blocked_until.get(client_ip)
        if not blocked_until:
            return False
        if blocked_until <= now:
            _auth_blocked_until.pop(client_ip, None)
            return False
        return True


def _reset_auth_failures(client_ip: str) -> None:
    with _auth_fail_lock:
        _auth_fail_hits.pop(client_ip, None)
        _auth_blocked_until.pop(client_ip, None)


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


async def require_api_auth(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    expected = (settings.API_AUTH_TOKEN or "").strip()
    provided = (x_api_key or _extract_bearer_token(authorization) or "").strip()
    client_ip = request.client.host if request.client else "unknown"

    if _is_ip_blocked(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed authentication attempts. Try again later.",
        )

    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API authentication secret is not configured",
        )

    if not expected or not provided or not secrets.compare_digest(provided, expected):
        # Only track failures when a credential was provided; anonymous requests should not trigger lockout.
        if provided:
            _record_auth_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _reset_auth_failures(client_ip)


async def require_writer_role(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    await require_api_auth(request=request, authorization=authorization, x_api_key=x_api_key)