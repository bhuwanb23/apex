@echo off
REM ============================================================
REM  Apex Sports Intelligence — run EVERYTHING with Docker
REM  (ML service + backend + app web) in one click.
REM
REM  First run builds the images (several minutes). Afterwards:
REM    - App:      http://localhost:8081
REM    - Backend:  http://localhost:8000  (docs: /api-docs)
REM    - ML:       http://localhost:8001  (docs: /docs)
REM
REM  Stop: Ctrl+C in this window, or run  stop-docker.cmd
REM ============================================================
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Docker not found. Install Docker Desktop first:
  echo          https://www.docker.com/products/docker-desktop/
  echo.
  echo  No Docker? Run  start-dev.cmd  instead — it starts everything
  echo  with plain local processes (no Docker needed).
  echo.
  pause
  exit /b 1
)

echo Starting Apex (ML + backend + app) with Docker...
echo First build may take several minutes. App will be at http://localhost:8081
echo.
docker compose up --build
