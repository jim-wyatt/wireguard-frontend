.PHONY: help dev-setup dev-up dev-down prod-build prod-up prod-down logs clean test lint format

help:
	@echo "WireGuard Management - Available Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev-setup    - Initial development setup"
	@echo "  make dev-up       - Start development environment"
	@echo "  make dev-down     - Stop development environment"
	@echo "  make logs         - View logs"
	@echo ""
	@echo "Production:"
	@echo "  make prod-build   - Build production images"
	@echo "  make prod-up      - Start production environment"
	@echo "  make prod-down    - Stop production environment"
	@echo ""
	@echo "Maintenance:"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"
	@echo "  make clean        - Clean up generated files"

dev-setup:
	@echo "Running development setup..."
	chmod +x scripts/dev-setup.sh
	./scripts/dev-setup.sh

dev-up:
	@echo "Starting development environment..."
	docker-compose up -d
	@echo "Services started:"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend: http://localhost:8000"
	@echo "  API Docs: http://localhost:8000/docs"

dev-down:
	@echo "Stopping development environment..."
	docker-compose down

prod-build:
	@echo "Building production images..."
	chmod +x scripts/ensure-node-lts.sh
	bash -c 'source scripts/ensure-node-lts.sh && cd frontend && npm install && npm run build'
	docker-compose -f docker-compose.prod.yml build

prod-up:
	@echo "Starting production environment..."
	chmod +x scripts/deploy-prod.sh
	./scripts/deploy-prod.sh

prod-down:
	@echo "Stopping production environment..."
	docker-compose -f docker-compose.prod.yml down

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-frontend:
	docker-compose logs -f frontend

logs-caddy:
	docker-compose logs -f caddy

test:
	@echo "Running backend tests..."
	cd backend && source venv/bin/activate && pytest
	@echo "Running frontend tests..."
	chmod +x scripts/ensure-node-lts.sh
	bash -c 'source scripts/ensure-node-lts.sh && cd frontend && npm test'

lint:
	@echo "Linting backend..."
	cd backend && source venv/bin/activate && flake8 .
	@echo "Linting frontend..."
	chmod +x scripts/ensure-node-lts.sh
	bash -c 'source scripts/ensure-node-lts.sh && cd frontend && npm run lint'

format:
	@echo "Formatting backend code..."
	cd backend && source venv/bin/activate && black .
	@echo "Formatting frontend code..."
	chmod +x scripts/ensure-node-lts.sh
	bash -c 'source scripts/ensure-node-lts.sh && cd frontend && npm run lint:fix'

clean:
	@echo "Cleaning up..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	rm -f backend/wireguard.db
	@echo "Clean complete!"

setup-wireguard:
	@echo "Setting up WireGuard server..."
	sudo chmod +x scripts/setup-wireguard.sh
	sudo ./scripts/setup-wireguard.sh

backup-db:
	@echo "Backing up database..."
	docker-compose exec db pg_dump -U wireguard wireguard > backup-$(shell date +%Y%m%d-%H%M%S).sql
	@echo "Database backed up!"

backup-wg:
	@echo "Backing up WireGuard configuration..."
	sudo tar -czf wireguard-backup-$(shell date +%Y%m%d-%H%M%S).tar.gz /etc/wireguard/
	@echo "WireGuard configuration backed up!"

status:
	@echo "Service Status:"
	@docker-compose ps
	@echo ""
	@echo "WireGuard Status:"
	@sudo wg show 2>/dev/null || echo "WireGuard not running or no permission"
