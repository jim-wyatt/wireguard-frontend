#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
FRONTEND_ENV_FILE="$ROOT_DIR/frontend/.env.local"

random_hex() {
  openssl rand -hex 32
}

set_or_append_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
fi

API_SECRET_KEY="$(random_hex)"
API_AUTH_TOKEN="$(random_hex)"

set_or_append_env "$ENV_FILE" "API_SECRET_KEY" "$API_SECRET_KEY"
set_or_append_env "$ENV_FILE" "API_AUTH_TOKEN" "$API_AUTH_TOKEN"

mkdir -p "$(dirname "$FRONTEND_ENV_FILE")"
touch "$FRONTEND_ENV_FILE"
if ! grep -q "^VITE_API_URL=" "$FRONTEND_ENV_FILE"; then
  echo "VITE_API_URL=/api" >> "$FRONTEND_ENV_FILE"
fi

echo "Generated backend API secrets."
echo "- Updated: $ENV_FILE"
echo "- Updated: $FRONTEND_ENV_FILE"