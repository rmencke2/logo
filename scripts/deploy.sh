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
  # Approvals write mcp-servers-manual.json on the server. Preserve local-only
  # rows across reset --hard so an uncommitted approve is not wiped again.
  if [[ -z "${DEPLOY_PRESERVE_DIR:-}" ]]; then
    DEPLOY_PRESERVE_DIR="$(mktemp -d /tmp/influzer-deploy-preserve.XXXXXX)"
    export DEPLOY_PRESERVE_DIR
    if [[ -f data/mcp-servers-manual.json ]]; then
      cp data/mcp-servers-manual.json "${DEPLOY_PRESERVE_DIR}/mcp-servers-manual.json"
    fi
    if [[ -d data/mcp-submissions ]]; then
      cp -a data/mcp-submissions "${DEPLOY_PRESERVE_DIR}/mcp-submissions"
    fi
    if [[ -d data/mcp-claims ]]; then
      cp -a data/mcp-claims "${DEPLOY_PRESERVE_DIR}/mcp-claims"
    fi
  fi

  echo "==> Reset to origin/${BRANCH}"
  git reset --hard "origin/${BRANCH}"

  if [[ -f "${DEPLOY_PRESERVE_DIR}/mcp-servers-manual.json" ]]; then
    echo "==> Re-applying local-only MCP manual listings"
    node scripts/merge-preserved-mcp-manual.js "${DEPLOY_PRESERVE_DIR}/mcp-servers-manual.json"
  fi
  if [[ -d "${DEPLOY_PRESERVE_DIR}/mcp-submissions" ]]; then
    mkdir -p data/mcp-submissions
    # Keep submission review records that exist only on this host.
    shopt -s nullglob
    for f in "${DEPLOY_PRESERVE_DIR}/mcp-submissions"/*.json; do
      base="$(basename "${f}")"
      if [[ ! -f "data/mcp-submissions/${base}" ]]; then
        cp "${f}" "data/mcp-submissions/${base}"
      fi
    done
    shopt -u nullglob
  fi
  if [[ -d "${DEPLOY_PRESERVE_DIR}/mcp-claims" ]]; then
    mkdir -p data/mcp-claims
    shopt -s nullglob
    for f in "${DEPLOY_PRESERVE_DIR}/mcp-claims"/*.json; do
      base="$(basename "${f}")"
      if [[ ! -f "data/mcp-claims/${base}" ]]; then
        cp "${f}" "data/mcp-claims/${base}"
      fi
    done
    shopt -u nullglob
  fi
  # Approvals that were wiped before manuals were preserved still leave
  # reviewStatus=approved submission files — rebuild those listings here.
  if [[ -d data/mcp-submissions ]]; then
    echo "==> Rehydrating approved MCP listings from submissions"
    node scripts/rehydrate-approved-mcp-manual.js
  fi

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

# Small Lightsail boxes OOM without swap when npm ci runs.
if [[ "${SERVER_MODE}" == 1 ]] && [[ -x "${SCRIPT_DIR}/ensure-swap.sh" ]]; then
  echo "==> Ensuring swap"
  bash "${SCRIPT_DIR}/ensure-swap.sh" || echo "WARN: ensure-swap failed"
fi

echo "==> Installing dependencies"
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found."
  exit 1
fi

install_deps() {
  npm install --omit=dev "$@"
}

DEPS_HASH_FILE="${PROJECT_ROOT}/.deploy-deps-hash"
NPM_CI_TIMEOUT_S="${NPM_CI_TIMEOUT_S:-480}"
lock_hash=""
if [[ -f package-lock.json ]]; then
  lock_hash="$(sha256sum package-lock.json | awk '{print $1}')"
fi

skip_npm_install=0
if [[ "${SERVER_MODE}" == 1 ]] \
  && [[ -n "${lock_hash}" ]] \
  && [[ -f "${DEPS_HASH_FILE}" ]] \
  && [[ "$(cat "${DEPS_HASH_FILE}" 2>/dev/null || true)" == "${lock_hash}" ]] \
  && [[ -d node_modules ]] \
  && node scripts/verify-native-deps.js >/dev/null 2>&1; then
  skip_npm_install=1
  echo "    skipping npm ci (package-lock unchanged + native deps OK)"
fi

npm_ci_args=(--omit=dev)
rebuild_sqlite_from_source=0
if [[ "${SERVER_MODE}" == 1 && "${skip_npm_install}" == 0 ]]; then
  # sqlite3@6 prebuilds require GLIBC 2.38+; Debian 12 / Lightsail has 2.36.
  # Rebuild sqlite3 only after ci — global --build-from-source breaks canvas prebuilds.
  rebuild_sqlite_from_source=1
  echo "    sqlite3: will rebuild from source after npm ci (glibc 2.36 prod)"
fi

if [[ "${skip_npm_install}" == 0 ]]; then
  # Free RAM before heavy install on 1GB boxes; keep downtime short.
  if [[ "${SERVER_MODE}" == 1 ]]; then
    echo "    stopping ${PM2_APP_NAME} during dependency install"
    pm2 stop "${PM2_APP_NAME}" >/dev/null 2>&1 || true
  fi
  export npm_config_jobs="${npm_config_jobs:-1}"
  export JOBS="${JOBS:-1}"

  run_with_timeout() {
    local secs="$1"
    shift
    if command -v timeout >/dev/null 2>&1; then
      timeout --signal=TERM --kill-after=30s "${secs}" "$@"
    else
      "$@"
    fi
  }

  if [[ -f "package-lock.json" ]] && node -e "JSON.parse(require('fs').readFileSync('package-lock.json','utf8'))" 2>/dev/null; then
    echo "    using npm ci (valid package-lock.json, timeout ${NPM_CI_TIMEOUT_S}s, jobs=${npm_config_jobs})"
    if ! run_with_timeout "${NPM_CI_TIMEOUT_S}" npm ci "${npm_ci_args[@]}"; then
      echo "WARN: npm ci failed or timed out; falling back to npm install"
      if ! run_with_timeout "${NPM_CI_TIMEOUT_S}" install_deps; then
        echo "ERROR: dependency install failed. App left stopped — fix node_modules before restart."
        exit 1
      fi
    fi
  else
    echo "    using npm install (no valid package-lock.json)"
    if ! run_with_timeout "${NPM_CI_TIMEOUT_S}" install_deps; then
      echo "ERROR: npm install failed or timed out"
      exit 1
    fi
  fi

  if [[ "${rebuild_sqlite_from_source}" == 1 ]]; then
    echo "==> Rebuilding sqlite3 from source"
    if ! run_with_timeout 300 npm rebuild sqlite3 --build-from-source; then
      echo "ERROR: sqlite3 rebuild failed (see DEPLOY_INSTRUCTIONS.md glibc section)"
      exit 1
    fi
  fi

  echo "==> Verifying native dependencies"
  if ! node scripts/verify-native-deps.js; then
    echo "ERROR: native dependency check failed (see sqlite3 / glibc notes in DEPLOY_INSTRUCTIONS.md)"
    exit 1
  fi
  if [[ -n "${lock_hash}" ]]; then
    echo "${lock_hash}" > "${DEPS_HASH_FILE}"
  fi
else
  echo "==> Native dependencies already verified"
fi

echo "==> Restarting PM2 app: ${PM2_APP_NAME}"
if [[ -f "${PROJECT_ROOT}/ecosystem.config.cjs" ]]; then
  if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
    # Prefer in-place restart when deps were skipped (faster, less disruption).
    if [[ "${skip_npm_install}" == 1 ]]; then
      pm2 restart "${PM2_APP_NAME}" --update-env
    else
      pm2 delete "${PM2_APP_NAME}" >/dev/null 2>&1 || true
      pm2 start "${PROJECT_ROOT}/ecosystem.config.cjs"
    fi
  else
    pm2 start "${PROJECT_ROOT}/ecosystem.config.cjs"
  fi
else
  if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
    pm2 restart "${PM2_APP_NAME}"
  else
    pm2 start server.js --name "${PM2_APP_NAME}"
  fi
fi

pm2 save

# Confirm the process is actually answering before we call deploy done.
if [[ "${SERVER_MODE}" == 1 ]]; then
  echo "==> Post-deploy health check"
  health_ok=0
  for _ in 1 2 3 4 5 6; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 5 \
      "http://127.0.0.1:${PORT:-4000}/healthz" 2>/dev/null || echo 000)"
    if [[ "${code}" == "200" ]]; then
      health_ok=1
      break
    fi
    sleep 2
  done
  if [[ "${health_ok}" != 1 ]]; then
    echo "ERROR: /healthz did not return 200 after deploy"
    pm2 status "${PM2_APP_NAME}" || true
    exit 1
  fi
  echo "    /healthz OK"
fi

echo "==> PM2 status"
pm2 status "${PM2_APP_NAME}"

if [[ "${SERVER_MODE}" == 1 ]] && [[ -x "${SCRIPT_DIR}/install-watchdog.sh" ]]; then
  echo "==> Ensuring health watchdog cron + swap"
  # Default alert inbox; override with WATCHDOG_ALERT_EMAIL in the environment.
  WATCHDOG_ALERT_EMAIL="${WATCHDOG_ALERT_EMAIL:-mencke@gmail.com}" \
    "${SCRIPT_DIR}/install-watchdog.sh" || echo "WARN: watchdog install failed"
fi

echo "==> Current git revision"
git rev-parse --short HEAD

if [[ -x "${SCRIPT_DIR}/deploy.sh" ]]; then
  :
else
  chmod +x "${SCRIPT_DIR}/deploy.sh" 2>/dev/null || true
fi

echo "==> Deploy complete"
