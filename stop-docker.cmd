@echo off
REM Stops the Apex Docker stack (keeps data volumes).
cd /d "%~dp0"
docker compose down
