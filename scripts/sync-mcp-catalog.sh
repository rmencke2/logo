#!/usr/bin/env bash
#
# Pull MCP catalog updates committed by GitHub Actions and restart the app.
# Intended for a daily server cron (after validate-mcp-catalog.yml runs).
#
# Usage:
#   ./scripts/sync-mcp-catalog.sh
#   ./scripts/sync-mcp-catalog.sh main logo-generator
#
set -euo pipefail

BRANCH="${1:-main}"
PM2_APP_NAME="${2:-logo-generator}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

if [[ ! -d ".git" ]]; then
  echo "ERROR: ${PROJECT_ROOT} is not a git repository."
  exit 1
fi

echo "==> MCP catalog sync ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
git fetch origin "${BRANCH}"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${BRANCH}")"

if [[ "${LOCAL}" == "${REMOTE}" ]]; then
  echo "    No new commits on origin/${BRANCH} — nothing to sync."
  exit 0
fi

echo "    Updating ${LOCAL:0:7} -> ${REMOTE:0:7}"
git pull --ff-only origin "${BRANCH}"

if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  echo "==> Restarting PM2: ${PM2_APP_NAME}"
  pm2 restart "${PM2_APP_NAME}"
  pm2 save
else
  echo "WARN: PM2 app '${PM2_APP_NAME}' not found — skipped restart."
fi

echo "==> Sync complete at $(git rev-parse --short HEAD)"
