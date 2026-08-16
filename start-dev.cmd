@echo off
REM ============================================================
REM  Apex Sports Intelligence — run WITHOUT Docker
REM  Opens 3 terminals, one per service:
REM    Terminal 1 — Backend  (Node/Express API)   -> http://localhost:8000
REM    Terminal 2 — ML       (Python FastAPI)     -> http://localhost:8001
REM    Terminal 3 — App      (Expo web)           -> http://localhost:8081
REM
REM  Prereqs: Node.js 20+, Python 3.12+, npm.
REM  First run installs dependencies and sets up the ML venv.
REM ============================================================
cd /d "%~dp0"
setlocal

REM ---- checks ----
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org
  pause & exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python not found. Install Python 3.12+ from https://python.org
  pause & exit /b 1
)

echo.
echo Apex — opening 3 terminals (backend, ML, app)...
echo Close this window or Ctrl+C to stop everything.
echo.

REM ---- Terminal 1: Backend (port 8000) ----
start "Apex Backend (8000)" cmd /k ""cd /d "%~dp0backend" && if not exist .env copy .env.example .env >nul && npm install && npm run dev""

REM ---- Terminal 2: ML service (port 8001) ----
start "Apex ML (8001)" cmd /k ""cd /d "%~dp0backend\python_ml" && if not exist .env copy .env.example .env >nul && if not exist .venv (python -m venv .venv && .venv\Scripts\python -m pip install --upgrade pip && .venv\Scripts\python -m pip install -r requirements.txt) && .venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload""

REM ---- Terminal 3: App / Expo web (port 8081) ----
start "Apex App (8081)" cmd /k ""cd /d "%~dp0apex" && npm install && npx expo start --web --port 8081""

echo All 3 terminals launched. Press any key to close this launcher window.
pause >nul
