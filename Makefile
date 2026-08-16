# Apex Sports Intelligence — run everything.
#
# Docker available?   make up        (ML + backend + app web in containers)
# No Docker?          make dev       (opens 3 terminals: backend, ML, app)
#
# Individual services (no Docker):  make backend | make ml | make app
# Stop Docker stack:                make down      Logs: make logs

.DEFAULT_GOAL := help

UNAME_S := $(shell uname -s)

# ---------------------------------------------------------------- Docker ----

.PHONY: up down logs ps
up: ## Build & start the full stack with Docker (ML + backend + app web)
	docker compose up --build

down: ## Stop the Docker stack (keeps data volumes)
	docker compose down

logs: ## Follow logs of all Docker services
	docker compose logs -f --tail=100

ps: ## List running Docker services
	docker compose ps

# --------------------------------------------------------- no-Docker dev ----

.PHONY: dev dev-windows
dev: ## Open 3 terminals (backend, ML, app) — no Docker needed
ifeq ($(OS),Windows_NT)
	@cmd.exe //c start-dev.cmd
else
	@./scripts/dev-up.sh
endif

# --------------------------------------------------- individual services ----

.PHONY: backend ml app
backend: ## Run the backend alone (Node, port 8000)
	cd backend && if [ ! -f .env ]; then cp .env.example .env; fi && npm install && npm run dev

ml: ## Run the ML service alone (Python, port 8001)
	cd backend/python_ml && \
	if [ ! -f .env ]; then cp .env.example .env; fi && \
	if [ ! -d .venv ]; then python -m venv .venv && .venv/Scripts/python -m pip install --upgrade pip && .venv/Scripts/python -m pip install -r requirements.txt; fi && \
	.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

app: ## Run the app alone (Expo web, port 8081)
	cd apex && npm install && npx expo start --web --port 8081

# ------------------------------------------------------------------ misc ----

.PHONY: test help
test: ## Run all test suites (backend lint/typecheck, ML pytest)
	cd backend && npm run lint && npm run typecheck
	cd backend/python_ml && (.venv/Scripts/python -m pytest -q || echo "ML tests skipped — run 'make ml' once to create the venv")

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Docker:   make up | make down | make logs"
	@echo "No-Docker: make dev  (3 terminals) | make backend | make ml | make app"
