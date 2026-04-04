import secrets
import json
from enum import Enum
from datetime import datetime, timedelta, timezone
from collections import defaultdict, deque
from threading import Lock
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request, status

from app.core.config import settings


DEFAULT_INSECURE_SECRET = "change-this-secret-key"


class Role(str, Enum):
    PUBLIC = "public"
    WRITER = "writer"


@dataclass(frozen=True)
class TokenGrant:
    token: str
    role: Role
    expires_at: datetime | None


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


def _parse_expiry(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _configured_token_grants() -> list[TokenGrant]:
    raw_json = (settings.API_AUTH_TOKENS_JSON or "").strip()
    if raw_json:
        try:
            payload = json.loads(raw_json)
        except json.JSONDecodeError:
            return []

        if not isinstance(payload, list):
            return []

        grants: list[TokenGrant] = []
        for item in payload:
            if not isinstance(item, dict):
                continue

            token = str(item.get("token") or "").strip()
            role_raw = str(item.get("role") or Role.WRITER.value).strip().lower()
            expires_at = _parse_expiry(item.get("expires_at"))

            if not token:
                continue

            role = Role.WRITER if role_raw == Role.WRITER.value else Role.PUBLIC
            grants.append(TokenGrant(token=token, role=role, expires_at=expires_at))

        return grants

    legacy = (settings.API_AUTH_TOKEN or "").strip()
    if legacy:
        return [TokenGrant(token=legacy, role=Role.WRITER, expires_at=None)]
    return []


def _match_token_grant(provided: str) -> TokenGrant | None:
    now = datetime.now(timezone.utc)
    for grant in _configured_token_grants():
        if not secrets.compare_digest(provided, grant.token):
            continue
        if grant.expires_at and grant.expires_at <= now:
            return None
        return grant
    return None


async def require_api_auth(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    grants = _configured_token_grants()
    provided = (x_api_key or _extract_bearer_token(authorization) or "").strip()
    client_ip = request.client.host if request.client else "unknown"

    if _is_ip_blocked(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed authentication attempts. Try again later.",
        )

    if not grants:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API authentication secret is not configured",
        )

    matched_grant = _match_token_grant(provided) if provided else None

    if not matched_grant:
        # Only track failures when a credential was provided; anonymous requests should not trigger lockout.
        if provided:
            _record_auth_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _reset_auth_failures(client_ip)
    request.state.auth_role = matched_grant.role.value


async def require_writer_role(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    await require_api_auth(request=request, authorization=authorization, x_api_key=x_api_key)
    role = getattr(request.state, "auth_role", Role.PUBLIC.value)
    if role != Role.WRITER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Writer role required",
        )


async def optional_api_auth(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    """Best-effort auth for public endpoints; never raises on missing/invalid creds."""
    provided = (x_api_key or _extract_bearer_token(authorization) or "").strip()
    if not provided:
        return

    matched_grant = _match_token_grant(provided)
    if matched_grant:
        request.state.auth_role = matched_grant.role.value