#!/usr/bin/env bash
#
# Local liveness watchdog for logo-generator.
# If /healthz does not return 200 within TIMEOUT, restart PM2 after
# CONSECUTIVE_FAILS failures (avoids flapping on single blips).
#
# Install (on the server):
#   ./scripts/install-watchdog.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

PORT="${PORT:-4000}"
PM2_APP_NAME="${PM2_APP_NAME:-logo-generator}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/healthz}"
TIMEOUT_S="${WATCHDOG_TIMEOUT_S:-5}"
CONSECUTIVE_FAILS="${WATCHDOG_CONSECUTIVE_FAILS:-2}"
COOLDOWN_S="${WATCHDOG_COOLDOWN_S:-120}"
STATE_DIR="${WATCHDOG_STATE_DIR:-${PROJECT_ROOT}/logs/watchdog}"
LOG_FILE="${WATCHDOG_LOG:-${STATE_DIR}/watchdog.log}"
FAIL_FILE="${STATE_DIR}/fail_count"
COOLDOWN_FILE="${STATE_DIR}/last_restart"
ALERT_EMAIL="${WATCHDOG_ALERT_EMAIL:-}"

mkdir -p "${STATE_DIR}"

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "${msg}" | tee -a "${LOG_FILE}" >/dev/null
}

read_fail_count() {
  if [[ -f "${FAIL_FILE}" ]]; then
    cat "${FAIL_FILE}"
  else
    echo 0
  fi
}

write_fail_count() {
  echo "$1" > "${FAIL_FILE}"
}

in_cooldown() {
  if [[ ! -f "${COOLDOWN_FILE}" ]]; then
    return 1
  fi
  local last now
  last="$(cat "${COOLDOWN_FILE}")"
  now="$(date +%s)"
  if (( now - last < COOLDOWN_S )); then
    return 0
  fi
  return 1
}

mark_restart() {
  date +%s > "${COOLDOWN_FILE}"
}

send_alert() {
  local subject="$1"
  local body="$2"
  if [[ -z "${ALERT_EMAIL}" ]]; then
    return 0
  fi
  if command -v mail >/dev/null 2>&1; then
    printf '%s\n' "${body}" | mail -s "${subject}" "${ALERT_EMAIL}" || true
  fi
  # Optional Resend via local helper (best-effort; never fail the watchdog)
  if [[ -x "${SCRIPT_DIR}/watchdog-alert-email.js" ]]; then
    node "${SCRIPT_DIR}/watchdog-alert-email.js" "${ALERT_EMAIL}" "${subject}" "${body}" >/dev/null 2>&1 || true
  fi
}

# Skip while cooling down after a restart (app may still be booting)
if in_cooldown; then
  exit 0
fi

# If PM2 says the process is stopped/errored, count as failure.
# Note: env must be on `node`, not only on `pm2` (pipes don't inherit VAR= for the RHS).
pm2_status="$(
  pm2 jlist 2>/dev/null | PM2_APP_NAME="${PM2_APP_NAME}" node -e '
    let raw = "";
    process.stdin.on("data", (d) => { raw += d; });
    process.stdin.on("end", () => {
      try {
        const list = JSON.parse(raw || "[]");
        const app = list.find((p) => p.name === process.env.PM2_APP_NAME);
        if (!app) return console.log("missing");
        console.log(app.pm2_env && app.pm2_env.status ? app.pm2_env.status : "unknown");
      } catch {
        console.log("unknown");
      }
    });
  ' 2>/dev/null || echo unknown
)"
pm2_status="$(printf '%s' "${pm2_status}" | tr -d '\r' | head -n 1)"

http_code="000"
if [[ "${pm2_status}" == "online" ]]; then
  set +e
  http_code="$(
    curl -sS -o /tmp/watchdog-healthz.body -w '%{http_code}' \
      --connect-timeout "${TIMEOUT_S}" \
      --max-time "${TIMEOUT_S}" \
      "${HEALTH_URL}" 2>/dev/null
  )"
  curl_rc=$?
  set -e
  if [[ -z "${http_code}" || "${curl_rc}" -ne 0 ]]; then
    http_code="000"
  fi
fi

if [[ "${http_code}" == "200" ]]; then
  write_fail_count 0
  exit 0
fi

fails="$(read_fail_count)"
fails=$((fails + 1))
write_fail_count "${fails}"
body="$(head -c 400 /tmp/watchdog-healthz.body 2>/dev/null || true)"
log "FAIL ${fails}/${CONSECUTIVE_FAILS} status=${http_code} pm2=${pm2_status} url=${HEALTH_URL} body=${body}"

if (( fails < CONSECUTIVE_FAILS )); then
  exit 0
fi

log "RESTART ${PM2_APP_NAME} after ${fails} consecutive health failures"
mark_restart
write_fail_count 0

if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  if [[ "${pm2_status}" == "stopped" || "${pm2_status}" == "missing" ]]; then
    pm2 start "${PM2_APP_NAME}" || pm2 start "${PROJECT_ROOT}/ecosystem.config.cjs"
  else
    pm2 restart "${PM2_APP_NAME}" --update-env
  fi
else
  pm2 start "${PROJECT_ROOT}/ecosystem.config.cjs"
fi
pm2 save >/dev/null 2>&1 || true

send_alert \
  "[influzer] watchdog restarted ${PM2_APP_NAME}" \
  "Health check failed (${fails}x). http=${http_code} pm2=${pm2_status}
URL: ${HEALTH_URL}
Host: $(hostname)
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Body: ${body}"

log "RESTART complete"
exit 0
