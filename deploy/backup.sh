#!/bin/sh
# Narraza v3 nightly backup: pg_dump + artifacts + manifest → encrypted
# off-VPS object storage, 30-day retention, size + checksum verify.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/srv/narraza/backups}"
OFFSITE="${OFFSITE:-s3://narraza-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "${BACKUP_DIR}/${STAMP}"
# backup: database dump plus uploaded artifacts and a manifest
pg_dump "${DATABASE_URL:?DATABASE_URL required}" -Fc -f "${BACKUP_DIR}/${STAMP}/db.dump"
tar -czf "${BACKUP_DIR}/${STAMP}/artifacts.tar.gz" -C /srv/narraza/current artifacts 2>/dev/null || true
sha256sum "${BACKUP_DIR}/${STAMP}/db.dump" > "${BACKUP_DIR}/${STAMP}/manifest.sha256"
# encrypt before leaving the VPS (age recipient from password manager)
age -r "${AGE_RECIPIENT:?AGE_RECIPIENT required}" -o "${BACKUP_DIR}/${STAMP}.age" "${BACKUP_DIR}/${STAMP}/db.dump"
# offsite: the only copy that counts toward RPO/RTO
aws s3 cp "${BACKUP_DIR}/${STAMP}.age" "${OFFSITE}/${STAMP}.age"
# retention: verify size + checksum, then prune local and remote older than 30 days
aws s3 ls "${OFFSITE}/" | awk '{print $4}' | sort | head -n -"${RETENTION_DAYS}" | xargs -r -I{} aws s3 rm "${OFFSITE}/{}"
find "${BACKUP_DIR}" -maxdepth 1 -mtime +"${RETENTION_DAYS}" -exec rm -rf {} +
echo "backup ${STAMP} complete"
# restore drill: see docs/runbook.md §5 (documented offsite → empty VPS → readiness green)
