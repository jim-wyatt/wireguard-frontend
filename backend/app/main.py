from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import clients
from app.api import logs
from app.db.database import engine, Base, SessionLocal
from app.services.client_sync import sync_clients_with_wireguard


logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
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
        version="1.0.0",
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
    app.include_router(clients.router, prefix="/api", tags=["clients"])
    app.include_router(logs.router, prefix="/api", tags=["logs"])

    @app.get("/")
    async def root():
        return {
            "message": "WireGuard Management API",
            "version": "1.0.0",
            "docs": "/docs"
        }

    @app.get("/health")
    async def health_check():
        return {"status": "healthy"}

    return app

app = create_app()
