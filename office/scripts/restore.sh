#!/usr/bin/env bash
# Restore a backup made by backup.sh into a database whose schema was created from supabase/migrations
# (a fresh project, a branch, or `supabase db reset` locally). Never point this at a database that holds
# records you want to keep: it replaces the seeded settings and vaccine list with the backup's.
#   scripts/restore.sh backups/<timestamp>                 # local stack
#   SUPABASE_DB_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... scripts/restore.sh backups/<timestamp>
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${1:?usage: restore.sh <backup dir>}"
( cd "$DIR" && sha256sum --quiet -c SHA256SUMS ) || { echo "Backup checksum verification failed"; exit 1; }

run_psql() {
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q "$@";
  else docker exec -i supabase_db_petvax-office psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; fi
}
existing=$(run_psql -tA -c "select count(*) from public.owners")
if [[ "$existing" != "0" ]]; then echo "Refusing to restore: the target already has $existing clients."; exit 1; fi

# Rows created by the seed migration (settings, vaccine list, their audit entries) are replaced by the backup's copies.
run_psql -c "set session_replication_role = replica; truncate public.app_settings, public.vaccine_products, public.audit_events cascade;"
run_psql < "$DIR/data.sql"
npx tsx scripts/storage-restore.ts "$DIR/storage"
echo "✓ Restored from $DIR"
