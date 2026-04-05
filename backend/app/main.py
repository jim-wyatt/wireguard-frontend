from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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

    # Keep schema setup in startup lifecycle rather than import time.
    Base.metadata.create_all(bind=engine)

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
        title="WireGuard Management API",
        description="API for managing WireGuard VPN clients",
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
    app.include_router(clients.router, prefix="/api", tags=["nodes"])
    app.include_router(logs.router, prefix="/api", tags=["logs"])
    app.include_router(attestation.router, prefix="/api", tags=["attestation"])
    app.include_router(metrics.router, prefix="/api", tags=["metrics"])
    app.include_router(debug.router, prefix="/api", tags=["debug"])

    # Backward-compat: redirect /clients/* → /nodes/* (308 preserves method+body)
    @app.api_route("/api/clients/{path:path}", methods=["GET", "POST", "PATCH", "DELETE"], include_in_schema=False)
    async def clients_compat_redirect(path: str, request: Request):  # noqa: ARG001
        return RedirectResponse(url=f"/api/nodes/{path}", status_code=308)

    @app.api_route("/api/clients", methods=["GET", "POST"], include_in_schema=False)
    async def clients_root_compat(request: Request):  # noqa: ARG001
        return RedirectResponse(url="/api/nodes", status_code=308)

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
            "message": "WireGuard Management API",
            "version": settings.APP_VERSION,
            "docs": "/docs"
        }

    @app.get("/health")
    async def health_check():
        return {"status": "healthy"}

    return app

app = create_app()
