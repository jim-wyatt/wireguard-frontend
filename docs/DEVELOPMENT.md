# Development Guide

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn
- WireGuard tools
- PostgreSQL (optional, SQLite works for development)

## Setup

1. Clone the repository
2. Run the setup script:

```bash
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
```

## Project Structure

```
wireguard-frontend/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/            # API endpoints
│   │   ├── core/           # Core configuration
│   │   ├── db/             # Database models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   └── main.py         # FastAPI app
│   ├── requirements.txt
│   └── Containerfile
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API client
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── Containerfile
├── caddy/                 # Caddy configuration
│   ├── Caddyfile
│   └── Caddyfile.prod
├── scripts/               # Utility scripts
├── docs/                  # Documentation
├── compose.yml
└── README.md
```

## Running Development Server

### Option 1: Podman Compose (Recommended)

```bash
podman compose -f compose.yml up
```

Services will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Option 2: Manual

**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## Database

### SQLite (Default for Development)

No setup required. Database file is created automatically.

### PostgreSQL (Production)

1. Start PostgreSQL:
```bash
podman run -d \
  -e POSTGRES_USER=wireguard \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=wireguard \
  -p 5432:5432 \
  postgres:15-alpine
```

2. Update `.env`:
```env
DATABASE_URL=postgresql://wireguard:password@localhost:5432/wireguard
```

### Migrations

Using Alembic for database migrations:

```bash
cd backend
source venv/bin/activate

# Create migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Testing

### Backend Tests

```bash
cd backend
source venv/bin/activate
pytest
```

### Frontend Tests

```bash
cd frontend
npm run test
```

## Code Style

### Backend

Using Black for formatting and flake8 for linting:

```bash
cd backend
black .
flake8 .
```

### Frontend

Using ESLint:

```bash
cd frontend
npm run lint
npm run lint:fix
```

## Adding New Features

### Adding a Backend Endpoint

1. Create or update router in `backend/app/api/`
2. Add schema in `backend/app/schemas/`
3. Add database model if needed in `backend/app/db/models.py`
4. Update service logic in `backend/app/services/`
5. Test the endpoint

Example:
```python
# backend/app/api/example.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db

router = APIRouter()

@router.get("/example")
async def get_example(db: Session = Depends(get_db)):
    return {"message": "Hello"}
```

### Adding a Frontend Component

1. Create component in `frontend/src/components/`
2. Import and use in pages
3. Add API calls in `frontend/src/services/api.js` if needed

Example:
```jsx
// frontend/src/components/MyComponent.jsx
import { useState } from 'react'
import { Button } from '@mui/material'

function MyComponent() {
  const [count, setCount] = useState(0)
  
  return (
    <Button onClick={() => setCount(count + 1)}>
      Count: {count}
    </Button>
  )
}

export default MyComponent
```

## Environment Variables

### Backend (.env)

```env
DATABASE_URL=sqlite:///./wireguard.db
WG_INTERFACE=wg0
WG_SERVER_IP=10.0.0.1
WG_SERVER_PORT=443
WG_SERVER_PUBLIC_KEY=...
WG_SERVER_PRIVATE_KEY=...
WG_SERVER_ENDPOINT=...
WG_NETWORK=10.0.0.0/24
WG_DNS=1.1.1.1,8.8.8.8
API_SECRET_KEY=...
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=["http://localhost:5173"]
```

### Frontend (.env)

```env
VITE_API_URL=/api
```

## Debugging

### Backend Debugging

Using VS Code, add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "app.main:app",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8000"
      ],
      "jinja": true,
      "justMyCode": true,
      "cwd": "${workspaceFolder}/backend"
    }
  ]
}
```

### Frontend Debugging

Use React Developer Tools browser extension.

## Common Issues

### WireGuard permission denied

Backend needs elevated privileges to manage WireGuard. Run with:
```bash
sudo -E env PATH=$PATH uvicorn app.main:app --reload
```

Or use Podman with proper capabilities.

### Port already in use

Check and kill process:
```bash
lsof -ti:8000 | xargs kill -9  # Backend
lsof -ti:5173 | xargs kill -9  # Frontend
```

### Database locked (SQLite)

Stop all running instances and delete the database file:
```bash
rm backend/wireguard.db
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Write tests
4. Ensure code style compliance
5. Submit a pull request

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Material-UI Documentation](https://mui.com/)
- [WireGuard Documentation](https://www.wireguard.com/quickstart/)
- [Caddy Documentation](https://caddyserver.com/docs/)
