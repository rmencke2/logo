#!/usr/bin/env bash
# Run on Lightsail instance from repo root: ./mcp-directory/scripts/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${PM2_APP_NAME:-mcp-directory}"
PORT="${PORT:-3000}"

cd "$APP_DIR"

echo "==> Installing dependencies"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

echo "==> Building Next.js"
npm run build

echo "==> PM2 ($APP_NAME on port $PORT)"
export PORT
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  PORT="$PORT" pm2 restart "$APP_NAME" --update-env
else
  PORT="$PORT" pm2 start npm --name "$APP_NAME" -- start
fi
pm2 save

echo "==> Done. App should listen on http://127.0.0.1:$PORT"
pm2 status "$APP_NAME"
