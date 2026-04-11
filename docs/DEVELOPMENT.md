# Development Guide

## Prerequisites

- Python 3.12+ (3.14 recommended)
- Node.js LTS (scripts install/use latest LTS via nvm)
- Podman + podman-compose
- WireGuard tools (for full local integration)

## Fast Setup

```bash
cd wireguard-frontend
cp .env.example .env
make dev-setup
make dev-up
```

Services:

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs

Stop:

```bash
make dev-down
```

## Manual Mode

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Tests and Checks

```bash
# Full test target
make test

# Backend only
cd backend && PYTHONPATH=. pytest

# Frontend only
cd frontend && npm run test:run

# Frontend quality gates
cd frontend && npm run lint && npm run typecheck && npm run build
```

## Backend Notes

- API routes are registered in `backend/app/main.py`.
- Router modules live in `backend/app/api/`.
- Core auth/rate-limit/config logic is in `backend/app/core/`.
- WireGuard integration is in `backend/app/services/wireguard.py`.

## Frontend Notes

- Route/page components are under `frontend/src/pages/`.
- Shared components are under `frontend/src/components/`.
- API client lives in `frontend/src/services/api.ts`.
- MUI is on major v9. Prefer `sx` for layout system props.

## Environment Tips

- Keep `API_AUTH_TOKEN` and `API_AUTH_TOKENS_JSON` out of frontend build variables.
- For browser admin actions, set a session token at runtime via localStorage.
- Use `ENABLE_SECURITY_SIDECARS=true` only when you want the full security stack.

## Troubleshooting

```bash
# Backend health
curl http://127.0.0.1:8000/health

# Production compose logs
sudo podman-compose -f compose.prod.yml logs -f

# WireGuard status
sudo wg show
```

## Code Navigation

Use [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) as the source of truth for folder layout and ownership.
