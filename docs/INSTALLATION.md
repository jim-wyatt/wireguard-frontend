# Installation Guide

## Prerequisites

- Ubuntu/Debian Linux server with root access
- Domain name pointing to your server
- Ports 80, 443 (TCP and UDP) accessible

## Installation Steps

### 1. Install WireGuard

```bash
sudo chmod +x scripts/setup-wireguard.sh
sudo ./scripts/setup-wireguard.sh
```

This will:
- Install WireGuard
- Generate server keys
- Create WireGuard configuration
- Enable IP forwarding
- Configure firewall rules

Save the generated keys for the next step.

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Update the following values:
- `DOMAIN`: Your domain name
- `DATABASE_URL`: Your system PostgreSQL URL (example: `postgresql://user:password@127.0.0.1:5432/wireguard`)
- `WG_SERVER_PUBLIC_KEY`: From step 1
- `WG_SERVER_PRIVATE_KEY`: From step 1
- `WG_SERVER_ENDPOINT`: Your domain:443
- `API_SECRET_KEY`: Generate with `openssl rand -hex 32`
- `API_AUTH_TOKEN`: Generate with `openssl rand -hex 32`

### 3. Install Podman and Podman Compose

```bash
# Install Podman and compose wrapper
sudo apt update
sudo apt install -y podman podman-compose
```

### 4. Deploy Application

For development:
```bash
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
podman compose up -d
```

The development setup script automatically installs `nvm` (if missing) and the latest Node LTS before running frontend `npm` commands.

For production:
```bash
chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh
```

The production deployment script also ensures `nvm` + latest Node LTS are installed before building the frontend.

### 5. Verify Installation

Check that all services are running:
```bash
podman compose ps
```

Check WireGuard status:
```bash
sudo wg show
```

Access the application:
- Open your browser to `https://your-domain.com`

## Post-Installation

### Create First Client

1. Navigate to the "Clients" page
2. Click "Create Client"
3. Enter an email address
4. Download the configuration or scan the QR code
5. Import the configuration into your WireGuard client

### Monitor Connections

- View connected clients on the Dashboard
- Check real-time statistics
- Monitor data transfer

## Troubleshooting

### WireGuard not starting

```bash
sudo systemctl status wg-quick@wg0
sudo journalctl -u wg-quick@wg0 -n 50
```

### Backend cannot access WireGuard

Ensure the backend container has proper permissions:
```bash
podman compose logs backend
```

The backend runs in a container but mutates host WireGuard via:
- host network mode
- `NET_ADMIN` capability
- bind mount to `/etc/wireguard`

This keeps the VPN endpoint on the host kernel/interface while the app itself stays containerized.

### Database connection issues

Verify DATABASE_URL in .env matches your configuration.

If you use system PostgreSQL, check service status/logs:
```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql -n 50
```

### Caddy HTTPS issues

Ensure:
- Port 80 and 443 are open
- Domain DNS is correctly configured
- Email in Caddyfile is valid

Traffic model:
- Caddy handles web traffic on TCP 443.
- WireGuard handles VPN traffic directly on UDP 443 at the host level.
- Caddy does not proxy WireGuard UDP packets in this setup.

Check Caddy logs:
```bash
podman compose logs caddy
```

## Updating

```bash
git pull
podman compose down
podman compose up -d --build
```

## Backup

### Database Backup

```bash
podman compose exec db pg_dump -U wireguard wireguard > backup.sql
```

### WireGuard Configuration Backup

```bash
sudo cp -r /etc/wireguard /root/wireguard-backup-$(date +%Y%m%d)
```

## Security Recommendations

1. Change default passwords in `.env`
2. Keep system and Podman images updated
3. Enable automatic security updates
4. Use strong API secret keys
5. Regularly review connected clients
6. Monitor logs for suspicious activity
7. Consider implementing rate limiting
8. Use fail2ban for additional protection
9. Never embed `API_AUTH_TOKEN` in frontend build variables
10. For admin browser sessions, set a temporary token at runtime:

```js
localStorage.setItem('apiToken', '<API_AUTH_TOKEN>')
```

## Support

For issues and questions:
- Check logs: `podman compose logs`
- Review WireGuard status: `sudo wg show`
- Check firewall rules: `sudo ufw status`
