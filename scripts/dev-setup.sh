#!/bin/bash

# Development Setup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================="
echo "WireGuard Management - Dev Setup"
echo "======================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
fi

echo "Generating backend API secrets..."
chmod +x "$SCRIPT_DIR/generate-secrets.sh"
"$SCRIPT_DIR/generate-secrets.sh"

echo "Please verify these .env values before starting:"
echo "  - WG_SERVER_PUBLIC_KEY"
echo "  - WG_SERVER_PRIVATE_KEY"
echo "  - WG_SERVER_ENDPOINT"
read -p "Press enter when ready to continue..."

# Setup backend
echo ""
echo "Setting up backend..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
cd ..

# Setup frontend
echo ""
echo "Setting up frontend..."

chmod +x "$SCRIPT_DIR/ensure-node-lts.sh"
source "$SCRIPT_DIR/ensure-node-lts.sh"

cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..

echo ""
echo "======================================="
echo "Setup Complete!"
echo "======================================="
echo ""
echo "To start development:"
echo ""
echo "1. Backend (in one terminal):"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   uvicorn app.main:app --reload"
echo ""
echo "2. Frontend (in another terminal):"
echo "   cd frontend"
echo "   npm run dev"
echo ""
echo "Or use Podman Compose:"
echo "   podman compose up"
echo ""
