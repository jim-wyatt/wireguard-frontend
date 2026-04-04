# WireGuard Management Frontend

A modern web application for managing WireGuard VPN clients with an intuitive interface.

## Features

- 🔐 Create WireGuard client configurations via email
- 📊 View currently connected clients
- 🎨 Modern UI with Material-UI
- ⚡ Fast backend with FastAPI
- 🔒 Secure HTTPS with Caddy

## Tech Stack

### Frontend
- React 18
- Vite
- Material-UI (MUI)
- Axios for API calls

### Backend
- FastAPI
- SQLAlchemy
- SQLite/PostgreSQL
- WireGuard integration

### Infrastructure
- Caddy (Reverse proxy & HTTPS)
- Podman & Podman Compose
- WireGuard (Port 443/UDP)

## Project Structure

```
wireguard-frontend/
├── frontend/          # React + Vite application
├── backend/           # FastAPI application
├── caddy/             # Caddy configuration
├── compose.yml        # Compose services
└── README.md
```

## Quick Start

### Development

Use the setup script to install dependencies and generate random API secrets/tokens:

```bash
./scripts/dev-setup.sh
```

1. **Backend**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

2. **Frontend**
```bash
cd frontend
npm install
npm run dev
```

### Production with Podman

```bash
podman compose -f compose.yml up -d
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=sqlite:///./wireguard.db
# or for PostgreSQL:
# DATABASE_URL=postgresql://user:password@localhost/wireguard

# WireGuard
WG_INTERFACE=wg0
WG_SERVER_IP=10.0.0.1
WG_SERVER_PORT=443
WG_SERVER_PUBLIC_KEY=<your-public-key>

# API
API_SECRET_KEY=<generate-a-secure-key>
API_AUTH_TOKEN=<shared-token-for-protected-api-routes>
# Optional scoped tokens (writer/public) with optional expiry:
# API_AUTH_TOKENS_JSON=[{"token":"writer-token","role":"writer"},{"token":"readonly-token","role":"public","expires_at":"2026-12-31T23:59:59Z"}]
```

Do not expose `API_AUTH_TOKEN` to browser build variables. For admin actions from the UI, set a temporary session token in browser local storage:

```js
localStorage.setItem('apiToken', '<API_AUTH_TOKEN>')
```

Public dashboard endpoints remain readable without authentication.

## WireGuard Setup

The application expects WireGuard to be installed and configured on the host:

```bash
# Install WireGuard
sudo apt install wireguard

# Generate server keys
wg genkey | tee server_private.key | wg pubkey > server_public.key

# Configure WireGuard interface
sudo nano /etc/wireguard/wg0.conf
```

## API Endpoints

- Public dashboard reads:
	- `GET /api/clients/stats`
	- `GET /api/clients/connected`
- Writer-auth protected routes:
	- `POST /api/clients`
	- `GET /api/clients`
	- `GET /api/clients/{id}`
	- `GET /api/clients/{id}/config`
	- `PATCH /api/clients/{id}/toggle`
	- `DELETE /api/clients/{id}`

## Security Notes

- Always use HTTPS in production
- Keep WireGuard keys secure
- Use strong database credentials
- Implement rate limiting for client creation
- Validate email addresses before creating clients

## License

MIT
