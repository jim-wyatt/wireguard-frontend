#!/bin/bash

# Production Deployment Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
read -r -a COMPOSE_CMD <<< "${PROD_COMPOSE_CMD:-sudo podman-compose}"

cleanup_rootless_stack() {
    local rootless_containers

    if ! command -v podman >/dev/null 2>&1; then
        return 0
    fi

    rootless_containers="$(podman ps -a --filter label=io.podman.compose.project=wg -q 2>/dev/null || true)"
    if [ -z "$rootless_containers" ]; then
        return 0
    fi

    echo "Removing conflicting rootless compose stack before production deploy..."
    if command -v podman-compose >/dev/null 2>&1; then
        podman-compose -f compose.prod.yml down || true
    fi
    podman rm -f $rootless_containers || true
}

stop_orphaned_backend_listener() {
    local uvicorn_pattern="uvicorn app.main:app --host 127.0.0.1 --port 8000"
    local init_pattern="/run/podman-init -- uvicorn app.main:app --host 127.0.0.1 --port 8000"
    local listener_pids=()

    mapfile -t listener_pids < <(
        {
            pgrep -f "$uvicorn_pattern" || true
            pgrep -f "$init_pattern" || true
        } | sort -u
    )

    if [ "${#listener_pids[@]}" -eq 0 ]; then
        return 0
    fi

    echo "Stopping orphaned backend listeners on port 8000: ${listener_pids[*]}"
    sudo kill "${listener_pids[@]}" || true

    for pid in "${listener_pids[@]}"; do
        if sudo kill -0 "$pid" 2>/dev/null; then
            echo "Force-killing listener $pid after graceful stop timeout"
            sudo kill -9 "$pid" || true
        fi
    done
}

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
echo "Recreating existing services to apply newly built images..."
cleanup_rootless_stack
"${COMPOSE_CMD[@]}" -f compose.prod.yml down
stop_orphaned_backend_listener
"${COMPOSE_CMD[@]}" -f compose.prod.yml up -d --build
"${COMPOSE_CMD[@]}" -f compose.prod.yml restart backend

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
echo "  ${COMPOSE_CMD[*]} -f compose.prod.yml logs -f"
echo ""
echo "To check WireGuard status:"
echo "  sudo wg show"
echo ""
