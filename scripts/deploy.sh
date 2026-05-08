#!/usr/bin/env bash

set -euo pipefail

BRANCH="${1:-main}"
PM2_APP_NAME="${2:-logo-generator}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Deploy starting"
echo "    project: ${PROJECT_ROOT}"
echo "    branch:  ${BRANCH}"
echo "    app:     ${PM2_APP_NAME}"

cd "${PROJECT_ROOT}"

if [[ ! -d ".git" ]]; then
  echo "ERROR: ${PROJECT_ROOT} is not a git repository."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree is not clean. Commit/stash changes first."
  git status --short
  exit 1
fi

echo "==> Fetch latest from origin/${BRANCH}"
git fetch origin "${BRANCH}"

echo "==> Pull fast-forward only"
git pull --ff-only origin "${BRANCH}"

echo "==> Installing dependencies"
if command -v npm >/dev/null 2>&1; then
  if [[ -f "package-lock.json" ]]; then
    npm ci --omit=dev
  else
    npm install --omit=dev
  fi
else
  echo "ERROR: npm not found."
  exit 1
fi

echo "==> Restarting PM2 app: ${PM2_APP_NAME}"
if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_APP_NAME}"
else
  pm2 start server.js --name "${PM2_APP_NAME}"
fi

pm2 save

echo "==> PM2 status"
pm2 status "${PM2_APP_NAME}"

echo "==> Current git revision"
git rev-parse --short HEAD

echo "==> Deploy complete"
