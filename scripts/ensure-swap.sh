#!/usr/bin/env bash
#
# Ensure a 2G swapfile exists on small Lightsail boxes.
# Without swap, npm ci / native rebuilds OOM the whole host and take the site down.
#
set -euo pipefail

SWAPFILE="${SWAPFILE:-/swapfile}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"

if grep -q "${SWAPFILE}" /proc/swaps 2>/dev/null; then
  echo "    swap already active: $(awk -v f="${SWAPFILE}" '$1==f {print $3"K"}' /proc/swaps)"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
  echo "WARN: cannot create swap (need root/sudo)"
  exit 0
fi

run() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

echo "==> Ensuring ${SWAP_SIZE_GB}G swap at ${SWAPFILE}"
if [[ ! -f "${SWAPFILE}" ]]; then
  if run fallocate -l "${SWAP_SIZE_GB}G" "${SWAPFILE}" 2>/dev/null; then
    :
  else
    run dd if=/dev/zero of="${SWAPFILE}" bs=1M count=$((SWAP_SIZE_GB * 1024)) status=none
  fi
  run chmod 600 "${SWAPFILE}"
  run mkswap "${SWAPFILE}" >/dev/null
fi

run swapon "${SWAPFILE}" || true

if ! grep -q "${SWAPFILE}" /etc/fstab 2>/dev/null; then
  echo "${SWAPFILE} none swap sw 0 0" | run tee -a /etc/fstab >/dev/null
fi

if grep -q "${SWAPFILE}" /proc/swaps 2>/dev/null; then
  echo "    swap active"
else
  echo "WARN: swap file exists but is not active"
fi
