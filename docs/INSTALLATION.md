# Installation Guide

## Host Prerequisites

- Linux host (Ubuntu/Debian recommended)
- Domain DNS pointed at host
- Open ports: TCP 80/443, UDP 443
- Root or sudo access
- Podman and podman-compose

Install runtime tools:

```bash
sudo apt update
sudo apt install -y podman podman-compose wireguard wireguard-tools
```

## 1. WireGuard Host Setup

```bash
sudo chmod +x scripts/setup-wireguard.sh
sudo ./scripts/setup-wireguard.sh
```

Record generated keys and confirm interface health:

```bash
sudo wg show
```

## 2. Environment Configuration

```bash
cp .env.example .env
nano .env
```

Required:

- DOMAIN
- WG_SERVER_PUBLIC_KEY
- WG_SERVER_PRIVATE_KEY
- WG_SERVER_ENDPOINT
- API_SECRET_KEY

Auth:

- Preferred: API_AUTH_TOKENS_JSON (scoped writer/public grants)
- Legacy: API_AUTH_TOKEN

Database:

- Leave DATABASE_URL empty to let deploy script derive PostgreSQL URL from POSTGRES_* values.

## 3. Deploy Production Stack

```bash
make prod-up
```

What this does:

- Builds frontend assets
- Builds backend image
- Starts production compose services
- Restarts backend to ensure latest build is active

Enable full security sidecars:

```bash
ENABLE_SECURITY_SIDECARS=true make prod-up
```

## 4. Verify

```bash
sudo podman ps
curl http://127.0.0.1:8000/health
curl -k https://$DOMAIN/api/nodes/stats
```

## 5. Operate

```bash
# Rebuild only
make prod-build

# Stop stack
make prod-down

# Tail logs
sudo podman-compose -f compose.prod.yml logs -f
```

## Troubleshooting

WireGuard:

```bash
sudo wg show
sudo systemctl status wg-quick@wg0
```

Backend:

```bash
curl http://127.0.0.1:8000/health
sudo podman logs --tail 200 wg_backend_1
```

Caddy/TLS:

```bash
sudo podman logs --tail 200 wg_caddy_1
```

## Security Notes

- Keep auth tokens out of frontend build variables.
- Use short-lived scoped tokens where possible.
- Rotate credentials in `.env` periodically.
- Keep host packages and container images updated.
