# Backups, restore and rollback

**Primary protection:** Supabase's managed backups (daily on paid plans; enable Point-in-Time Recovery for a clinic
system). **Secondary:** the logical backups below, which you control and can restore anywhere.

## Take a backup

```bash
cd office
# Hosted project (session-pooler connection string from Dashboard → Connect):
SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' \
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
  scripts/backup.sh
```

Creates `backups/<UTC timestamp>/` with `schema.sql`, `data.sql` (all Office tables plus staff logins),
`storage/` (every signature, certificate PDF and attachment, with a SHA-256 manifest) and `SHA256SUMS`.
**It contains client and medical data:** keep it encrypted (e.g. an encrypted disk or vault) and never commit it
(`backups/` is git-ignored). Suggested: weekly, plus before every migration or import.

## Restore

Restore into a database whose schema was created from `supabase/migrations` (a new project, a branch, or a local
`supabase db reset`). The script verifies checksums, refuses to run if the target already has clients, loads the data
with triggers disabled (so hash chains and immutable records come back byte-for-byte) and re-uploads files.

```bash
SUPABASE_DB_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... scripts/restore.sh backups/<timestamp>
```

## Proving it works

`scripts/restore-drill.sh` (local stack only) fingerprints every table, backs up, wipes the database, rebuilds it from
migrations, restores, and checks: identical fingerprints for all tables and staff logins, intact audit and consent
hash chains, and every signature image and certificate PDF matching its recorded SHA-256. It runs in CI.

## Rollback of a bad change

- App code: redeploy the previous version (Vercel → Deployments → Promote).
- A migration: write a new forward migration that undoes it; for data damage restore the pre-change backup into a
  new project/branch, compare, and copy back what is needed. Clinical records are append-only by design, so most
  mistakes are fixed with a correction (vaccinations), amendment (SOAP), or void (certificates), never by deleting.
