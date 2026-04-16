# Quick Start

This guide gets you running quickly in either development or production mode.

## Development (Local)

```bash
cd wireguard-frontend
cp .env.example .env
make dev-setup
make dev-up
```

Access:

- UI: http://localhost:5173
- API docs: http://localhost:8000/docs

Stop:

```bash
make dev-down
```

## Production (Host)

Prerequisites:

- Linux host with root privileges
- Domain mapped to host
- Podman and podman-compose installed
- WireGuard configured on host

Minimal flow:

```bash
cd wireguard-frontend
cp .env.example .env
nano .env
make prod-up
```

The deploy script validates required variables and builds frontend/backend artifacts.

## Required .env Values

- DOMAIN
- WG_SERVER_PUBLIC_KEY
- WG_SERVER_PRIVATE_KEY
- WG_SERVER_ENDPOINT
- API_SECRET_KEY

Recommended:

- API_AUTH_TOKENS_JSON for scoped token grants
- API_AUTH_TOKEN only for backward compatibility
- WG_CLIENT_ALLOWED_IPS=$WG_NETWORK to keep routing peer-to-peer inside the VPN subnet

## Verify Health

```bash
curl http://127.0.0.1:8000/health
curl -k https://$DOMAIN/api/peers/stats
sudo podman ps
```

## Common Operations

```bash
# Build only
make prod-build

# Stop production stack
make prod-down

# Run tests
make test

# Smoke test API (uses .env)
make smoke
```

## Troubleshooting

```bash
# Compose logs
sudo podman-compose -f compose.prod.yml logs -f

# WireGuard runtime
sudo wg show

# Backend health
curl http://127.0.0.1:8000/health
```

## Next Docs

- [README.md](README.md)
- [docs/INSTALLATION.md](docs/INSTALLATION.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/API.md](docs/API.md)
