# Quick Start Guide

Get your WireGuard management system up and running in minutes!

## 🚀 Fast Track (Development)

```bash
# 1. Clone and navigate to project
cd wireguard-frontend

# 2. Setup development environment
make dev-setup

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings (use dummy values for testing)

# 4. Start services
make dev-up

# 5. Access the application
# Frontend: http://localhost:5173
# API Docs: http://localhost:8000/docs
```

## 🌐 Production Deployment

### Prerequisites
- Ubuntu/Debian server
- Domain name pointed to your server
- Root access

### Steps

```bash
# 1. Install WireGuard
make setup-wireguard
# Save the keys shown at the end

# 2. Configure environment
cp .env.example .env
nano .env
# Set all required values

# 3. Install Podman
sudo apt update
sudo apt install -y podman podman-compose

# 4. Deploy
make prod-up

# 5. Access
# https://your-domain.com
```

## 📱 Create Your First Client

1. Open the web interface
2. Navigate to "Clients" page
3. Click "Create Client"
4. Enter email address
5. Click on the download icon to get the config
6. Scan QR code with WireGuard mobile app or download .conf file

## 🔧 Essential Commands

```bash
# View logs
make logs

# Check status
make status

# Stop services
make dev-down  # or prod-down

# Backup database
make backup-db

# Backup WireGuard config
make backup-wg
```

## 📊 Monitoring

### Check Connected Clients
- View Dashboard in web interface
- Updates every 10 seconds automatically

### Command Line
```bash
# View WireGuard status
sudo wg show

# View specific interface
sudo wg show wg0

# View service logs
make logs-backend
make logs-frontend
```

## 🔐 Security Checklist

Before going to production:

- [ ] Change all default passwords in `.env`
- [ ] Set strong `API_SECRET_KEY` (use `openssl rand -hex 32`)
- [ ] Configure firewall (ufw)
- [ ] Set up proper domain with HTTPS
- [ ] Review and limit CORS origins
- [ ] Enable automatic updates
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Review WireGuard server configuration

## 🐛 Troubleshooting

### Services won't start
```bash
# Check Podman Compose
podman compose ps
podman compose logs

# Check WireGuard
sudo systemctl status wg-quick@wg0
sudo wg show
```

### Can't create clients
```bash
# Check backend logs
make logs-backend

# Verify WireGuard is running
sudo wg show wg0

# Check permissions
ls -la /etc/wireguard/
```

### Frontend can't connect to backend
```bash
# Check CORS settings in backend/.env
# Verify API is responding
curl http://localhost:8000/health

# Check network
podman network ls
```

## 📚 Next Steps

- Read [INSTALLATION.md](docs/INSTALLATION.md) for detailed setup
- Check [API.md](docs/API.md) for API documentation
- See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for development guide
- Review [README.md](README.md) for complete overview

## 💡 Tips

1. **Testing**: Use SQLite for development, PostgreSQL for production
2. **Logs**: Always check logs when troubleshooting
3. **Backups**: Run regular backups (make backup-db, make backup-wg)
4. **Updates**: Keep Podman images and system packages updated
5. **Security**: Never commit .env files to version control

## 🆘 Getting Help

1. Check the logs: `make logs`
2. Review documentation in `docs/`
3. Verify .env configuration
4. Check WireGuard status: `sudo wg show`
5. Test API: http://localhost:8000/docs

## 📈 Performance Tips

- Use PostgreSQL for production (better than SQLite)
- Enable Caddy caching for static assets
- Monitor disk space for database growth
- Regularly clean up inactive clients
- Use monitoring tools (Prometheus/Grafana)

---

Happy VPN managing! 🎉
