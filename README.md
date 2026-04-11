# WireGuard Management

Web control plane for WireGuard peer lifecycle, observability, and security attestation.

## What This Project Does

- Provision and manage WireGuard peers (called "nodes" in API/UI).
- Expose public and authenticated operational dashboards.
- Aggregate runtime metrics and security evidence into API summaries.
- Deploy as a host-networked Podman stack with Caddy TLS frontend.

## Current Stack

### Frontend
- React 19
- Vite 8
- MUI 9
- ESLint 10

### Backend
- FastAPI
- SQLAlchemy
- Pydantic v2
- Uvicorn

### Infrastructure
- Podman + podman-compose
- Caddy
- PostgreSQL
- Optional security sidecars (Falco, CrowdSec, Trivy, Parca)

## Repository Map

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for a complete annotated tree.

High-level directories:

- `backend/`: FastAPI app and domain logic
- `frontend/`: React/Vite UI
- `caddy/`: reverse-proxy config
- `docs/`: technical and operational docs
- `scripts/`: setup and deployment helpers

## Quick Commands

```bash
# Dev
make dev-setup
make dev-up

# Production
make prod-build
make prod-up

# Validation
make test
make smoke
make e2e
```

## Configuration

Create `.env` from `.env.example` and set at minimum:

- `DOMAIN`
- `WG_SERVER_PUBLIC_KEY`
- `WG_SERVER_PRIVATE_KEY`
- `WG_SERVER_ENDPOINT`
- `API_SECRET_KEY`

Auth options:

- Legacy single token: `API_AUTH_TOKEN`
- Preferred scoped grants: `API_AUTH_TOKENS_JSON`

Runtime token for browser admin actions (never in frontend build variables):

```js
localStorage.setItem('apiToken', '<token>')
```

## API Overview

- Public endpoints: root/health, node stats, logs stream, attestation summary, metrics summary
- Authenticated endpoints: node list/detail/connected
- Writer-only endpoints: create, toggle, delete, fetch config

See [docs/API.md](docs/API.md) for route details.

## Documentation Index

- [docs/README.md](docs/README.md)
- [QUICKSTART.md](QUICKSTART.md)
- [docs/INSTALLATION.md](docs/INSTALLATION.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/API.md](docs/API.md)

## License

MIT
