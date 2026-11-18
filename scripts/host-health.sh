#!/usr/bin/env bash
#
# Host-level health: swap, disk, nginx, PM2 daemon.
# Complements watchdog-health.sh (app /healthz). Runs every 5 minutes via cron.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

export PATH="/opt/bitnami/node/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

STATE_DIR="${WATCHDOG_STATE_DIR:-${PROJECT_ROOT}/logs/watchdog}"
LOG_FILE="${HOST_HEALTH_LOG:-${STATE_DIR}/host-health.log}"
ALERT_EMAIL="${WATCHDOG_ALERT_EMAIL:-}"
DISK_MAX_PCT="${HOST_DISK_MAX_PCT:-90}"
MEM_MIN_AVAIL_MB="${HOST_MEM_MIN_AVAIL_MB:-80}"

mkdir -p "${STATE_DIR}"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "${LOG_FILE}" >/dev/null
}

send_alert() {
  local subject="$1"
  local body="$2"
  [[ -z "${ALERT_EMAIL}" ]] && return 0
  if command -v mail >/dev/null 2>&1; then
    printf '%s\n' "${body}" | mail -s "${subject}" "${ALERT_EMAIL}" || true
  fi
  if [[ -x "${SCRIPT_DIR}/watchdog-alert-email.js" ]]; then
    node "${SCRIPT_DIR}/watchdog-alert-email.js" "${ALERT_EMAIL}" "${subject}" "${body}" >/dev/null 2>&1 || true
  fi
}

problems=()

# Swap must stay on — without it, npm/deploy can OOM the host.
if [[ ! -s /proc/swaps ]] || [[ "$(wc -l </proc/swaps)" -lt 2 ]]; then
  if [[ -x "${SCRIPT_DIR}/ensure-swap.sh" ]]; then
    log "SWAP missing — attempting ensure-swap.sh"
    bash "${SCRIPT_DIR}/ensure-swap.sh" >>"${LOG_FILE}" 2>&1 || true
  fi
  if [[ ! -s /proc/swaps ]] || [[ "$(wc -l </proc/swaps)" -lt 2 ]]; then
    problems+=("swap_inactive")
  fi
fi

# Disk pressure
disk_pct="$(df -P "${PROJECT_ROOT}" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [[ -n "${disk_pct}" ]] && (( disk_pct >= DISK_MAX_PCT )); then
  problems+=("disk_${disk_pct}pct")
fi

# Available memory (kB in /proc/meminfo)
avail_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
avail_mb=$((avail_kb / 1024))
if (( avail_mb > 0 && avail_mb < MEM_MIN_AVAIL_MB )); then
  problems+=("mem_avail_${avail_mb}mb")
fi

# nginx (Bitnami or systemd)
nginx_ok=0
if command -v sudo >/dev/null 2>&1; then
  if sudo /opt/bitnami/ctlscript.sh status nginx 2>/dev/null | grep -qi 'already running\|is running'; then
    nginx_ok=1
  elif systemctl is-active --quiet nginx 2>/dev/null; then
    nginx_ok=1
  fi
fi
if [[ "${nginx_ok}" -eq 0 ]]; then
  # Try a cheap local listen check
  if ss -ltn 2>/dev/null | grep -qE ':80 |:443 '; then
    nginx_ok=1
  fi
fi
if [[ "${nginx_ok}" -eq 0 ]]; then
  log "nginx down — attempting restart"
  if command -v sudo >/dev/null 2>&1; then
    sudo /opt/bitnami/ctlscript.sh start nginx >>"${LOG_FILE}" 2>&1 \
      || sudo systemctl start nginx >>"${LOG_FILE}" 2>&1 \
      || true
  fi
  sleep 2
  if ss -ltn 2>/dev/null | grep -qE ':80 |:443 '; then
    log "nginx restarted"
    send_alert "[influzer] nginx restarted" "nginx was down on $(hostname); auto-restarted."
  else
    problems+=("nginx_down")
  fi
fi

# PM2 daemon must be up so the app watchdog can act
PM2_BIN="$(command -v pm2 || true)"
[[ -z "${PM2_BIN}" && -x /opt/bitnami/node/bin/pm2 ]] && PM2_BIN=/opt/bitnami/node/bin/pm2
if [[ -n "${PM2_BIN}" ]]; then
  if ! "${PM2_BIN}" ping >/dev/null 2>&1; then
    log "pm2 daemon dead — resurrecting"
    "${PM2_BIN}" resurrect >>"${LOG_FILE}" 2>&1 || "${PM2_BIN}" start "${PROJECT_ROOT}/ecosystem.config.cjs" >>"${LOG_FILE}" 2>&1 || true
    problems+=("pm2_resurrected")
  fi
else
  problems+=("pm2_missing")
fi

if (( ${#problems[@]} > 0 )); then
  log "HOST_ISSUES ${problems[*]} disk=${disk_pct}% mem_avail=${avail_mb}MB"
  # Avoid email storms: at most one host alert per 30 minutes
  stamp="${STATE_DIR}/last_host_alert"
  now="$(date +%s)"
  last=0
  [[ -f "${stamp}" ]] && last="$(cat "${stamp}" || echo 0)"
  if (( now - last > 1800 )); then
    echo "${now}" > "${stamp}"
    send_alert \
      "[influzer] host health: ${problems[*]}" \
      "Host: $(hostname)
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Issues: ${problems[*]}
Disk: ${disk_pct}%
MemAvailable: ${avail_mb}MB
Swap: $(tr '\n' ' ' </proc/swaps 2>/dev/null || echo none)"
  fi
  exit 1
fi

log "OK disk=${disk_pct}% mem_avail=${avail_mb}MB"
exit 0
