import secrets
from enum import Enum

from fastapi import Header, HTTPException, status

from app.core.config import settings


DEFAULT_INSECURE_SECRET = "change-this-secret-key"


class Role(str, Enum):
    PUBLIC = "public"
    WRITER = "writer"


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


async def require_api_auth(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    expected = (settings.API_AUTH_TOKEN or settings.API_SECRET_KEY or "").strip()
    provided = (x_api_key or _extract_bearer_token(authorization) or "").strip()

    using_default_secret = not (settings.API_AUTH_TOKEN or "").strip() and expected == DEFAULT_INSECURE_SECRET
    if using_default_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API authentication secret is not configured",
        )

    if not expected or not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_writer_role(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    await require_api_auth(authorization=authorization, x_api_key=x_api_key)