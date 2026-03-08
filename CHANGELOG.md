# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-03-07

### Added
- Initial release
- React + Vite + Material-UI frontend
- FastAPI backend with SQLAlchemy
- WireGuard integration
- Client management (create, list, delete, toggle)
- Configuration download with QR codes
- Real-time connected clients monitoring
- Dashboard with statistics
- Caddy reverse proxy setup
- Docker and Docker Compose configuration
- Complete documentation
- Setup and deployment scripts
- PostgreSQL and SQLite support
- Automatic HTTPS with Caddy

### Features
- ✅ Create WireGuard clients via email
- ✅ Download client configurations
- ✅ Generate QR codes for easy mobile setup
- ✅ View currently connected clients
- ✅ Monitor bandwidth usage (RX/TX)
- ✅ Enable/disable clients
- ✅ Delete clients
- ✅ Real-time connection status
- ✅ Material Design UI
- ✅ Responsive layout
- ✅ Docker-based deployment

### Security
- HTTPS by default with automatic certificate management
- Security headers configured in Caddy
- IP forwarding and NAT for VPN traffic
- Isolated Docker network
- Environment-based configuration

### Known Limitations
- No authentication system (to be added in future version)
- No rate limiting on client creation
- No email notifications
- No multi-user support
- Single WireGuard server support

## [Unreleased]

### Planned Features
- User authentication and authorization
- Multi-tenancy support
- Email notifications for new clients
- Rate limiting
- Client bandwidth limits
- Automatic client expiration
- Audit logging
- API key management
- 2FA support
- Backup and restore functionality
