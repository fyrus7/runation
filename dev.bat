@echo off
cd /d "%~dp0"

echo Starting Runation local preview...
echo.

call npx wrangler pages dev . --d1 DB=d6cc4668-6b11-4e99-9177-1ee70075ccf5 --r2 R2 --persist-to .local-d1 --compatibility-date=2026-05-10

echo.
echo Wrangler stopped or failed.
pause