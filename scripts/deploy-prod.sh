#!/bin/bash

# Production Deployment Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================="
echo "Production Deployment"
echo "======================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please create .env from .env.example and configure it"
    exit 1
fi

# Source environment variables
source .env

# Validate required variables
REQUIRED_VARS=(
    "DOMAIN"
    "DATABASE_URL"
    "WG_SERVER_PUBLIC_KEY"
    "WG_SERVER_PRIVATE_KEY"
    "WG_SERVER_ENDPOINT"
    "API_SECRET_KEY"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "ERROR: $var is not set in .env"
        exit 1
    fi
done

echo "Building frontend..."
chmod +x "$SCRIPT_DIR/ensure-node-lts.sh"
source "$SCRIPT_DIR/ensure-node-lts.sh"

cd frontend
npm install
npm run build
cd ..

echo "Building and starting services..."
docker-compose -f docker-compose.prod.yml up -d --build

echo ""
echo "======================================="
echo "Deployment Complete!"
echo "======================================="
echo ""
echo "Services are running:"
echo "  - Web: https://$DOMAIN"
echo "  - API: https://$DOMAIN/api"
echo "  - Metrics: http://$DOMAIN:2019/metrics"
echo ""
echo "To view logs:"
echo "  docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "To check WireGuard status:"
echo "  sudo wg show"
echo ""
