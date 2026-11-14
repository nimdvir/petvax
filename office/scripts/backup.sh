#!/usr/bin/env bash
# Logical backup of PetVax Office: database data + every stored file.
#   Local stack:   scripts/backup.sh
#   Hosted:        SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' \
#                  NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... scripts/backup.sh
# Output: backups/<UTC timestamp>/{schema.sql,data.sql,storage/,SHA256SUMS}. Contains client data: store it encrypted.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"
TARGET=()
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then TARGET=(--remote="$SUPABASE_DB_URL"); fi

npx supabase db dump "${TARGET[@]}" -s public,private -f "$OUT/schema.sql" </dev/null
npx supabase db dump "${TARGET[@]}" --data-only --use-copy -s public,auth -f "$OUT/data.sql" </dev/null
npx tsx scripts/storage-backup.ts "$OUT/storage"
( cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS )
echo "✓ Backup written to $OUT"
