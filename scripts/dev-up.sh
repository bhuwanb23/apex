#!/usr/bin/env bash
# Apex no-Docker dev launcher (macOS / Linux).
# Opens 3 terminals — backend, ML, app — one per service.
# Windows uses start-dev.cmd instead (make dev routes automatically).

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Opening 3 terminals: backend (8000), ML (8001), app (8081)..."

# Terminal emulator per platform
if command -v gnome-terminal >/dev/null 2>&1; then
  OPEN="gnome-terminal -- bash -c"
elif command -v xterm >/dev/null 2>&1; then
  OPEN="xterm -e bash -c"
elif command -v osascript >/dev/null 2>&1; then
  OPEN_APPLE=1
else
  echo "No supported terminal emulator found. Run manually:"
  echo "  Terminal 1: cd $ROOT/backend && npm run dev"
  echo "  Terminal 2: cd $ROOT/backend/python_ml && .venv/bin/python -m uvicorn app.main:app --port 8001 --reload"
  echo "  Terminal 3: cd $ROOT/apex && npx expo start --web --port 8081"
  exit 0
fi

if [ -n "${OPEN_APPLE:-}" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT/backend' && npm run dev\""
  osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT/backend/python_ml' && python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -r requirements.txt -q 2>/dev/null; .venv/bin/python -m uvicorn app.main:app --port 8001 --reload\""
  osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT/apex' && npx expo start --web --port 8081\""
else
  $OPEN "cd '$ROOT/backend' && npm install && npm run dev" &
  $OPEN "cd '$ROOT/backend/python_ml' && python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -r requirements.txt -q 2>/dev/null; .venv/bin/python -m uvicorn app.main:app --port 8001 --reload" &
  $OPEN "cd '$ROOT/apex' && npm install && npx expo start --web --port 8081" &
fi

echo "Launched. URLs: app http://localhost:8081 · backend http://localhost:8000 · ML http://localhost:8001"
