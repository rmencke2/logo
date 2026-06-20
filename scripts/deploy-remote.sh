#!/usr/bin/env bash
#
# Deploy to Lightsail from your Mac — no browser SSH needed.
#
# One-time setup:
#   cp .deploy.env.example .deploy.env
#   Edit .deploy.env (host, user, SSH key path)
#
# Usage:
#   ./scripts/deploy-remote.sh              # pull + restart on server (commit already on GitHub)
#   ./scripts/deploy-remote.sh --push       # git push origin main, then deploy
#   ./scripts/deploy-remote.sh --sync       # catalog-only sync (git pull + pm2 restart)
#   ./scripts/deploy-remote.sh --check      # test SSH only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PUSH=0
SYNC_ONLY=0
CHECK_ONLY=0

for arg in "$@"; do
  case "${arg}" in
    --push) PUSH=1 ;;
    --sync) SYNC_ONLY=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      echo ""
      echo "Config: .deploy.env in project root (see .deploy.env.example)"
      exit 0
      ;;
    *)
      echo "Unknown option: ${arg} (try --help)"
      exit 1
      ;;
  esac
done

# Load local deploy config (gitignored)
ENV_FILE="${PROJECT_ROOT}/.deploy.env"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
else
  echo "ERROR: Missing ${ENV_FILE}"
  echo "       cp .deploy.env.example .deploy.env"
  echo "       Then set DEPLOY_HOST, DEPLOY_USER, and DEPLOY_KEY."
  exit 1
fi

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-bitnami}"
DEPLOY_KEY="${DEPLOY_KEY:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/bitnami/logo}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-logo-generator}"
SSH_OPTS="${SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=15}"

if [[ -z "${DEPLOY_HOST}" ]]; then
  echo "ERROR: Set DEPLOY_HOST in .deploy.env"
  exit 1
fi

SSH_BASE=(ssh ${SSH_OPTS})
if [[ -n "${DEPLOY_KEY}" ]]; then
  if [[ ! -f "${DEPLOY_KEY}" ]]; then
    echo "ERROR: SSH key not found: ${DEPLOY_KEY}"
    exit 1
  fi
  SSH_BASE+=(-i "${DEPLOY_KEY}")
fi
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

remote() {
  "${SSH_BASE[@]}" "${SSH_TARGET}" "$@"
}

echo "==> Remote deploy"
echo "    host: ${SSH_TARGET}"
echo "    path: ${DEPLOY_PATH}"
echo "    branch: ${DEPLOY_BRANCH}"
echo "    app: ${PM2_APP_NAME}"

if [[ "${CHECK_ONLY}" == 1 ]]; then
  echo "==> Testing SSH..."
  remote "echo OK && hostname && cd '${DEPLOY_PATH}' && pwd && git rev-parse --short HEAD 2>/dev/null || echo '(no git yet)'"
  echo "==> SSH check passed"
  exit 0
fi

cd "${PROJECT_ROOT}"

if [[ "${PUSH}" == 1 ]]; then
  echo "==> Pushing to origin/${DEPLOY_BRANCH}"
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "ERROR: Working tree not clean. Commit first, or deploy without --push."
    git status --short
    exit 1
  fi
  git push origin "${DEPLOY_BRANCH}"
else
  # Warn if local main is ahead of origin (common footgun)
  git fetch origin "${DEPLOY_BRANCH}" 2>/dev/null || true
  LOCAL="$(git rev-parse HEAD 2>/dev/null || echo '')"
  REMOTE="$(git rev-parse "origin/${DEPLOY_BRANCH}" 2>/dev/null || echo '')"
  if [[ -n "${LOCAL}" && -n "${REMOTE}" && "${LOCAL}" != "${REMOTE}" ]]; then
    AHEAD="$(git rev-list --count "origin/${DEPLOY_BRANCH}..HEAD" 2>/dev/null || echo 0)"
    BEHIND="$(git rev-list --count "HEAD..origin/${DEPLOY_BRANCH}" 2>/dev/null || echo 0)"
    if [[ "${AHEAD}" -gt 0 ]]; then
      echo "WARN: You are ${AHEAD} commit(s) ahead of origin/${DEPLOY_BRANCH}."
      echo "      Server will not get those changes until you git push (or use --push)."
    fi
    if [[ "${BEHIND}" -gt 0 ]]; then
      echo "NOTE: origin/${DEPLOY_BRANCH} is ${BEHIND} commit(s) ahead of local — server will get the latest from GitHub."
    fi
  fi
fi

if [[ "${SYNC_ONLY}" == 1 ]]; then
  echo "==> Catalog sync on server (git pull + pm2 restart)"
  remote "cd '${DEPLOY_PATH}' && chmod +x scripts/sync-mcp-catalog.sh 2>/dev/null; ./scripts/sync-mcp-catalog.sh '${DEPLOY_BRANCH}' '${PM2_APP_NAME}'"
else
  echo "==> Full deploy on server"
  remote "cd '${DEPLOY_PATH}' && chmod +x scripts/deploy.sh && ./scripts/deploy.sh '${DEPLOY_BRANCH}' '${PM2_APP_NAME}' --server"
fi

echo "==> Done. Site should be on commit:"
remote "cd '${DEPLOY_PATH}' && git rev-parse --short HEAD"
