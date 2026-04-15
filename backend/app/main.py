from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import OperationalError
from app.core.config import settings
from app.core.internal_metrics import internal_metrics
from app.core.logging_config import configure_logging
from app.api import clients
from app.api import logs
from app.api import attestation
from app.api import metrics
from app.api import debug
from app.db.database import engine, Base, SessionLocal
from app.services.client_sync import sync_clients_with_wireguard


logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    settings.validate_security_configuration()

    # Retry DB schema setup with bounded backoff so the backend doesn't crash-loop
    # when Postgres isn't ready yet (e.g. cold start without depends_on ordering).
    max_db_retries = 10
    for attempt in range(1, max_db_retries + 1):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except OperationalError as exc:
            if attempt == max_db_retries:
                raise
            wait = min(2 ** attempt, 30)
            logger.warning(
                "Database not ready (attempt %d/%d), retrying in %ds: %s",
                attempt, max_db_retries, wait, exc,
            )
            time.sleep(wait)

    db = SessionLocal()
    try:
        summary = sync_clients_with_wireguard(db)
        logger.info("WireGuard startup sync complete: %s", summary)
    except Exception:
        logger.exception("WireGuard startup sync failed")
    finally:
        db.close()

    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="WireGuard Peer Management API",
        description="API for managing WireGuard VPN peers",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        docs_url="/docs" if settings.ENABLE_API_DOCS else None,
        openapi_url="/openapi.json" if settings.ENABLE_API_DOCS else None,
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )

    # Include routers
    app.include_router(clients.router, prefix="/api", tags=["peers"])
    app.include_router(logs.router, prefix="/api", tags=["logs"])
    app.include_router(attestation.router, prefix="/api", tags=["attestation"])
    app.include_router(metrics.router, prefix="/api", tags=["metrics"])
    app.include_router(debug.router, prefix="/api", tags=["debug"])

    # Backward-compat: keep legacy /clients endpoints discoverable and redirect
    # them to the canonical /peers routes (308 preserves method and body).
    def _peers_redirect(path: str = "") -> RedirectResponse:
        clean = path.lstrip('/')
        url = "/api/peers/" + clean if clean else "/api/peers"
        return RedirectResponse(url=url, status_code=308)

    @app.api_route("/api/clients", methods=["GET", "POST"])
    async def clients_root_compat(request: Request):  # noqa: ARG001
        return _peers_redirect()

    @app.get("/api/clients/stats")
    async def clients_stats_compat(request: Request):  # noqa: ARG001
        return _peers_redirect("stats")

    @app.get("/api/clients/connected")
    async def clients_connected_compat(request: Request):  # noqa: ARG001
        return _peers_redirect("connected")

    @app.api_route("/api/clients/{client_id}", methods=["GET", "DELETE"])
    async def clients_detail_compat(client_id: int, request: Request):  # noqa: ARG001
        return _peers_redirect(str(client_id))

    @app.get("/api/clients/{client_id}/config")
    async def clients_config_compat(client_id: int, request: Request):  # noqa: ARG001
        return _peers_redirect(f"{client_id}/config")

    @app.patch("/api/clients/{client_id}/toggle")
    async def clients_toggle_compat(client_id: int, request: Request):  # noqa: ARG001
        return _peers_redirect(f"{client_id}/toggle")

    @app.api_route("/api/clients/{path:path}", methods=["GET", "POST", "PATCH", "DELETE"], include_in_schema=False)
    async def clients_compat_redirect(path: str, request: Request):  # noqa: ARG001
        return _peers_redirect(path)

    @app.middleware("http")
    async def capture_internal_metrics(request, call_next):
        start = time.perf_counter()
        internal_metrics.request_started()
        try:
            response = await call_next(request)
        except Exception:
            latency_ms = (time.perf_counter() - start) * 1000.0
            internal_metrics.request_finished(status_code=500, latency_ms=latency_ms)
            raise

        latency_ms = (time.perf_counter() - start) * 1000.0
        internal_metrics.request_finished(status_code=response.status_code, latency_ms=latency_ms)
        return response

    @app.get("/")
    async def root():
        return {
            "message": "WireGuard Peer Management API",
            "version": settings.APP_VERSION,
            "docs": "/docs"
        }

    @app.get("/health")
    async def health_check():
        return {"status": "healthy"}

    return app

app = create_app()
