#!/bin/sh
# Narraza v3 release flow (VPS Ubuntu): upload → checksum verify → drain →
# locked migrate → symlink → reload → readiness + smoke. Rollback: --rollback.
set -eu

RELEASES_DIR="${RELEASES_DIR:-/srv/narraza/releases}"
CURRENT_LINK="${CURRENT_LINK:-/srv/narraza/current}"
EXPECTED_CHECKSUM="${1:-}"
PREVIOUS_CHECKSUM="${2:-}"

if [ "${1:-}" = "--rollback" ]; then
  if [ -z "${PREVIOUS_CHECKSUM}" ]; then echo "rollback needs a checksum" >&2; exit 1; fi
  ln -sfn "${RELEASES_DIR}/${PREVIOUS_CHECKSUM}" "${CURRENT_LINK}"
  pm2 reload ecosystem.config.cjs
  # readiness gate after rollback reload
  curl -fsS "https://localhost/api/readiness" >/dev/null
  echo "rollback complete to ${PREVIOUS_CHECKSUM}"
  exit 0
fi

if [ -z "${EXPECTED_CHECKSUM}" ]; then echo "usage: release.sh <checksum> [--rollback <prev>]" >&2; exit 1; fi

ARTIFACT_DIR="${RELEASES_DIR}/${EXPECTED_CHECKSUM}"
# checksum: abort when the uploaded artifact does not match the staging-passed digest
echo "${EXPECTED_CHECKSUM}  ${ARTIFACT_DIR}.tar.gz" | sha256sum -c -
mkdir -p "${ARTIFACT_DIR}"
tar -xzf "${ARTIFACT_DIR}.tar.gz" -C "${ARTIFACT_DIR}"
# drain: let the worker finish in-flight jobs before reload (PM2 kill_timeout 35s)
pm2 sendSignal SIGTERM worker || true
# migrate: single-runner locked migration before switching traffic
pnpm --filter @narraza/db migrate
ln -sfn "${ARTIFACT_DIR}" "${CURRENT_LINK}"
pm2 reload ecosystem.config.cjs
# readiness: migration version + smoke before declaring success
curl -fsS "https://localhost/api/readiness" >/dev/null
echo "release ${EXPECTED_CHECKSUM} live"
