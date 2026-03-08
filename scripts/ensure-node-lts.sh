#!/bin/bash

set -e

NVM_VERSION="v0.40.3"

if [ ! -d "$HOME/.nvm" ]; then
  echo "Installing nvm ${NVM_VERSION}..."
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if ! command -v nvm >/dev/null 2>&1; then
  echo "ERROR: nvm is not available after installation"
  exit 1
fi

echo "Installing/using latest Node LTS via nvm..."
nvm install --lts
nvm alias default 'lts/*' >/dev/null
nvm use --lts >/dev/null

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"
