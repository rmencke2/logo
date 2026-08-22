#!/usr/bin/env bash
#
# Deploy latest main to this machine and restart PM2.
#
# Usage (local — requires clean git working tree):
#   ./scripts/deploy.sh
#
# Usage (Lightsail / production — overwrites local tracked changes):
#   ./scripts/deploy.sh main logo-generator --server
#
set -euo pipefail

BRANCH="${1:-main}"
PM2_APP_NAME="${2:-logo-generator}"
SERVER_MODE="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${SERVER_MODE}" == "--server" ]] || [[ "${DEPLOY_SERVER:-}" == "1" ]]; then
  SERVER_MODE=1
else
  SERVER_MODE=0
fi

echo "==> Deploy starting"
echo "    project: ${PROJECT_ROOT}"
echo "    branch:  ${BRANCH}"
echo "    app:     ${PM2_APP_NAME}"
echo "    mode:    $([[ "${SERVER_MODE}" == 1 ]] && echo 'server (reset --hard)' || echo 'local (ff-only, clean tree)')"

cd "${PROJECT_ROOT}"

if [[ ! -d ".git" ]]; then
  echo "ERROR: ${PROJECT_ROOT} is not a git repository."
  exit 1
fi

if [[ "${SERVER_MODE}" == 0 ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree is not clean. Commit/stash changes first,"
  echo "       or run on the server with: ./scripts/deploy.sh ${BRANCH} ${PM2_APP_NAME} --server"
  git status --short
  exit 1
fi

echo "==> Fetch latest from origin/${BRANCH}"
git fetch origin "${BRANCH}"

if [[ "${SERVER_MODE}" == 1 ]]; then
  echo "==> Reset to origin/${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  # Script file updates on disk after reset, but this shell still runs the old
  # in-memory copy — re-exec so install steps (e.g. sqlite3 rebuild) apply.
  if [[ "${DEPLOY_SELF_REEXEC:-}" != 1 ]]; then
    export DEPLOY_SELF_REEXEC=1
    exec "$0" "$@"
  fi
else
  echo "==> Pull fast-forward only"
  git pull --ff-only origin "${BRANCH}"
fi

echo "==> Installing dependencies"
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found."
  exit 1
fi

install_deps() {
  npm install --omit=dev "$@"
}

npm_ci_args=(--omit=dev)
rebuild_sqlite_from_source=0
if [[ "${SERVER_MODE}" == 1 ]]; then
  # sqlite3@6 prebuilds require GLIBC 2.38+; Debian 12 / Lightsail has 2.36.
  # Rebuild sqlite3 only after ci — global --build-from-source breaks canvas prebuilds.
  rebuild_sqlite_from_source=1
  echo "    sqlite3: will rebuild from source after npm ci (glibc 2.36 prod)"
fi

if [[ -f "package-lock.json" ]] && node -e "JSON.parse(require('fs').readFileSync('package-lock.json','utf8'))" 2>/dev/null; then
  echo "    using npm ci (valid package-lock.json)"
  if ! npm ci "${npm_ci_args[@]}"; then
    echo "WARN: npm ci failed; falling back to npm install"
    install_deps
  fi
else
  echo "    using npm install (no valid package-lock.json)"
  install_deps
fi

if [[ "${rebuild_sqlite_from_source}" == 1 ]]; then
  echo "==> Rebuilding sqlite3 from source"
  if ! npm rebuild sqlite3 --build-from-source; then
    echo "ERROR: sqlite3 rebuild failed (see DEPLOY_INSTRUCTIONS.md glibc section)"
    exit 1
  fi
fi

echo "==> Verifying native dependencies"
if ! node scripts/verify-native-deps.js; then
  echo "ERROR: native dependency check failed (see sqlite3 / glibc notes in DEPLOY_INSTRUCTIONS.md)"
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

if [[ -x "${SCRIPT_DIR}/deploy.sh" ]]; then
  :
else
  chmod +x "${SCRIPT_DIR}/deploy.sh" 2>/dev/null || true
fi

echo "==> Deploy complete"
