#!/usr/bin/env bash
#
# Install (or refresh) the minute cron for scripts/watchdog-health.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WATCHDOG="${PROJECT_ROOT}/scripts/watchdog-health.sh"
LOG_DIR="${PROJECT_ROOT}/logs/watchdog"
MARKER="# influzer-watchdog"

chmod +x "${WATCHDOG}"
mkdir -p "${LOG_DIR}"

# Optional: export WATCHDOG_ALERT_EMAIL=you@example.com before running
ALERT_LINE=""
if [[ -n "${WATCHDOG_ALERT_EMAIL:-}" ]]; then
  ALERT_LINE="WATCHDOG_ALERT_EMAIL=${WATCHDOG_ALERT_EMAIL} "
fi

CRON_CMD="${ALERT_LINE}PORT=4000 PM2_APP_NAME=logo-generator ${WATCHDOG} >> ${LOG_DIR}/cron.log 2>&1"
CRON_ENTRY="* * * * * ${CRON_CMD} ${MARKER}"

existing="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "${existing}" | grep -v 'influzer-watchdog' || true)"
{
  printf '%s\n' "${filtered}"
  printf '%s\n' "${CRON_ENTRY}"
} | sed '/^$/N;/^\n$/D' | crontab -

echo "==> Watchdog cron installed"
crontab -l | grep influzer-watchdog || true
echo "    log: ${LOG_DIR}/watchdog.log"
echo "    cron log: ${LOG_DIR}/cron.log"
echo "==> Running one check now"
PORT=4000 PM2_APP_NAME=logo-generator "${WATCHDOG}" || true
echo "==> Done"
