#!/usr/bin/env bash
#
# Install (or refresh) crons for app + host health watchdogs.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WATCHDOG="${PROJECT_ROOT}/scripts/watchdog-health.sh"
HOST_HEALTH="${PROJECT_ROOT}/scripts/host-health.sh"
ENSURE_SWAP="${PROJECT_ROOT}/scripts/ensure-swap.sh"
LOG_DIR="${PROJECT_ROOT}/logs/watchdog"
MARKER="# influzer-watchdog"
HOST_MARKER="# influzer-host-health"

chmod +x "${WATCHDOG}" "${HOST_HEALTH}" "${ENSURE_SWAP}" 2>/dev/null || true
mkdir -p "${LOG_DIR}"

# Optional: export WATCHDOG_ALERT_EMAIL=you@example.com before running
ALERT_LINE=""
if [[ -n "${WATCHDOG_ALERT_EMAIL:-}" ]]; then
  ALERT_LINE="WATCHDOG_ALERT_EMAIL=${WATCHDOG_ALERT_EMAIL} "
fi

CRON_CMD="${ALERT_LINE}PORT=4000 PM2_APP_NAME=logo-generator ${WATCHDOG} >> ${LOG_DIR}/cron.log 2>&1"
CRON_ENTRY="* * * * * ${CRON_CMD} ${MARKER}"

HOST_CMD="${ALERT_LINE}${HOST_HEALTH} >> ${LOG_DIR}/host-cron.log 2>&1"
HOST_ENTRY="*/5 * * * * ${HOST_CMD} ${HOST_MARKER}"

existing="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "${existing}" | grep -v 'influzer-watchdog' | grep -v 'influzer-host-health' || true)"
{
  printf '%s\n' "${filtered}"
  printf '%s\n' "${CRON_ENTRY}"
  printf '%s\n' "${HOST_ENTRY}"
} | sed '/^$/N;/^\n$/D' | crontab -

echo "==> Ensuring swap (prevents deploy OOM)"
bash "${ENSURE_SWAP}" || echo "WARN: ensure-swap failed"

echo "==> Watchdog crons installed"
crontab -l | grep -E 'influzer-(watchdog|host-health)' || true
echo "    app log: ${LOG_DIR}/watchdog.log"
echo "    host log: ${LOG_DIR}/host-health.log"
echo "==> Running one check now"
PORT=4000 PM2_APP_NAME=logo-generator "${WATCHDOG}" || true
WATCHDOG_ALERT_EMAIL="${WATCHDOG_ALERT_EMAIL:-}" "${HOST_HEALTH}" || true
echo "==> Done"
