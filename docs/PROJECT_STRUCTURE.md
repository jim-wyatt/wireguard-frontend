# Project Structure

Annotated repository layout for maintainability and onboarding.

## Top Level

- backend/: FastAPI service, business logic, persistence, and integration code
- frontend/: React/Vite UI, tests, and UI-level services
- caddy/: reverse proxy config for dev and production
- docs/: user, developer, API, and security documentation
- scripts/: setup/deploy helper scripts
- systemd/: optional systemd units for production lifecycle
- tests/: smoke-level integration checks
- compose.yml: development compose stack
- compose.prod.yml: production compose stack
- Makefile: primary command entrypoint

## Backend Layout

- backend/app/main.py: app factory, middleware, router registration
- backend/app/api/: HTTP route modules
- backend/app/core/: config, auth, rate-limit, logging, metrics internals
- backend/app/db/: SQLAlchemy engine and models
- backend/app/schemas/: API schemas
- backend/app/services/: WireGuard, sync, QR, and related services
- backend/tests/: backend test suite

## Frontend Layout

- frontend/src/main.tsx: UI bootstrap
- frontend/src/App.tsx: route-level composition
- frontend/src/features/: feature-scoped modules (observability, future domain slices)
- frontend/src/pages/: route pages
- frontend/src/components/: reusable UI components
- frontend/src/services/api.ts: API client bindings
- frontend/src/context/: auth and UI context providers
- frontend/src/__tests__/: component/page unit tests
- frontend/e2e/: Playwright test flows

## Operational Files

- caddy/Caddyfile: development proxy settings
- caddy/Caddyfile.prod: production TLS and routing
- docs/security/: SBOM and Trivy outputs consumed by attestation API
- scripts/deploy-prod.sh: production build/deploy orchestration
- scripts/dev-setup.sh: local bootstrap

## Conventions

- Use backend/app/api for new route groups and keep each module focused.
- Keep business logic in backend/app/services, not route handlers.
- Keep frontend page-level logic in src/pages and shared elements in src/components.
- Prefer updating existing docs in docs/ over creating duplicate top-level notes.
