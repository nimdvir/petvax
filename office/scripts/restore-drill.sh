#!/usr/bin/env bash
# LOCAL ONLY. Proves a backup can be restored: fingerprint → backup → wipe → restore → compare.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then echo "restore-drill only runs against the local stack"; exit 1; fi
PSQL=(docker exec -i supabase_db_petvax-office psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1)
FP_SQL="$(cat <<'SQL'
select string_agg(t || ':' || n || ':' || h, E'\n' order by t) from (
  select 'owners' t, count(*) n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.owners x union all
  select 'pets', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.pets x union all
  select 'pet_owners', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.pet_owners x union all
  select 'appointments', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.appointments x union all
  select 'intake_submissions', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.intake_submissions x union all
  select 'signed_consents', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.signed_consents x union all
  select 'soap_notes', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.soap_notes x union all
  select 'soap_note_revisions', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.soap_note_revisions x union all
  select 'vaccinations', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.vaccinations x union all
  select 'certificates', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.certificates x union all
  select 'documents', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.documents x union all
  select 'form_versions', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.form_versions x union all
  select 'staff_profiles', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.staff_profiles x union all
  select 'audit_events', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.audit_events x union all
  select 'auth.users', count(*), md5(coalesce(string_agg(x.id::text || x.email || x.encrypted_password, '|' order by x.id), '')) from auth.users x
) s;
SQL
)"
before=$("${PSQL[@]}" -c "$FP_SQL")
[[ -n "$before" ]] || { echo "no data"; exit 1; }
DIR="backups/drill-$(date -u +%Y%m%dT%H%M%SZ)"
scripts/backup.sh "$DIR" >/dev/null
echo "• backup taken ($DIR)"
npx supabase db reset </dev/null >/dev/null 2>&1
echo "• local database wiped and rebuilt from migrations"
scripts/restore.sh "$DIR" >/dev/null
after=$("${PSQL[@]}" -c "$FP_SQL")
if [[ "$before" != "$after" ]]; then echo "✗ Restored data differs:"; diff <(echo "$before") <(echo "$after"); exit 1; fi
echo "• all table fingerprints identical:"; echo "$before" | sed 's/^/    /'
broken=$("${PSQL[@]}" -c "select coalesce(private.verify_audit_chain()::text, 'intact')")
echo "• audit hash chain: $broken"; [[ "$broken" == "intact" ]] || exit 1
chain=$("${PSQL[@]}" -c "select count(*) from (select record_hash, prev_hash, lag(record_hash) over (order by created_at, id) as expected from public.signed_consents) c where prev_hash is distinct from expected")
echo "• consent hash chain breaks: $chain"; [[ "$chain" == "0" ]] || exit 1
npx tsx -e '
import { createHash } from "node:crypto";
import { serviceClient } from "./scripts/_env";
(async () => {
  const { db } = serviceClient();
  let n = 0;
  for (const c of (await db.from("signed_consents").select("signature_path, signature_sha256")).data ?? []) {
    if (!c.signature_path) continue;
    const f = await db.storage.from("consent-signatures").download(c.signature_path);
    const h = createHash("sha256").update(Buffer.from(await f.data!.arrayBuffer())).digest("hex");
    if (h !== c.signature_sha256) throw new Error("signature mismatch " + c.signature_path); n++;
  }
  for (const c of (await db.from("certificates").select("pdf_path, pdf_sha256")).data ?? []) {
    if (!c.pdf_path) continue;
    const f = await db.storage.from("certificates").download(c.pdf_path);
    const h = createHash("sha256").update(Buffer.from(await f.data!.arrayBuffer())).digest("hex");
    if (h !== c.pdf_sha256) throw new Error("certificate mismatch " + c.pdf_path); n++;
  }
  console.log("• " + n + " signature images and certificate PDFs match their recorded SHA-256");
})().catch((e) => { console.error("✗", e.message); process.exit(1); });'
echo "✓ Restore drill passed"
