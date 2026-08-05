#!/usr/bin/env bash
#
# One-time Lightsail deploy credential setup for this machine.
#
# Usage:
#   ./scripts/setup-deploy-creds.sh /path/to/LightsailDefaultKey.pem
#   # or paste PEM on stdin:
#   ./scripts/setup-deploy-creds.sh -
#
# Then test:
#   npm run deploy:remote -- --check
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
KEY_DEST="${HOME}/.ssh/LightsailDefaultKey.pem"
ENV_FILE="${PROJECT_ROOT}/.deploy.env"
EXAMPLE="${PROJECT_ROOT}/.deploy.env.example"

SRC="${1:-}"
if [[ -z "${SRC}" ]]; then
  echo "Usage: $0 <path-to.pem> | -"
  echo ""
  echo "Download the key from Lightsail → Account → SSH keys (same region as the instance),"
  echo "then pass the .pem path, or pipe PEM contents with: $0 -"
  exit 1
fi

mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"

if [[ "${SRC}" == "-" ]]; then
  echo "==> Reading PEM from stdin (end with Ctrl-D if interactive)..."
  cat > "${KEY_DEST}"
else
  if [[ ! -f "${SRC}" ]]; then
    echo "ERROR: Key file not found: ${SRC}"
    exit 1
  fi
  cp "${SRC}" "${KEY_DEST}"
fi

chmod 600 "${KEY_DEST}"

# Quick PEM sanity check
if ! grep -q "BEGIN .*PRIVATE KEY" "${KEY_DEST}"; then
  echo "ERROR: ${KEY_DEST} does not look like a private key PEM."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${EXAMPLE}" "${ENV_FILE}"
fi

# Point DEPLOY_KEY at this machine's path
if grep -q '^DEPLOY_KEY=' "${ENV_FILE}"; then
  sed -i "s|^DEPLOY_KEY=.*|DEPLOY_KEY=${KEY_DEST}|" "${ENV_FILE}"
else
  echo "DEPLOY_KEY=${KEY_DEST}" >> "${ENV_FILE}"
fi

echo "==> Wrote key: ${KEY_DEST} (chmod 600)"
echo "==> Updated:  ${ENV_FILE}"
echo ""
echo "Next:"
echo "  npm run deploy:remote -- --check"
echo "  # after PR is merged to main:"
echo "  npm run deploy:remote"
