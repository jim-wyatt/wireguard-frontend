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
- Docker & Docker Compose
- WireGuard (Port 443/UDP)

## Project Structure

```
wireguard-frontend/
├── frontend/          # React + Vite application
├── backend/           # FastAPI application
├── caddy/             # Caddy configuration
├── docker-compose.yml # Docker services
└── README.md
```

## Quick Start

### Development

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

### Production with Docker

```bash
docker-compose up -d
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
```

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

- `POST /api/clients` - Create new client
- `GET /api/clients` - List all clients
- `GET /api/clients/{id}` - Get client details
- `GET /api/clients/{id}/config` - Download client config
- `GET /api/clients/connected` - List connected clients
- `DELETE /api/clients/{id}` - Remove client

## Security Notes

- Always use HTTPS in production
- Keep WireGuard keys secure
- Use strong database credentials
- Implement rate limiting for client creation
- Validate email addresses before creating clients

## License

MIT
