# Requirements status

Legend: **Done & tested** = implemented and verified by automated tests that write to and read back from a real (local) Supabase database.
**Partial** = works but with a stated gap. **Blocked** = needs something only the owner can provide. Mobile tests use Chromium emulating an iPhone 13 and an iPad; real-device Safari testing has not been done.

| Area | Status | Notes / evidence |
|---|---|---|
| Separate branch, draft PR, no changes to `main` | Done | |
| Public website preserved | Done | Only change: the Pages workflow now excludes `office/` so app source isn't published on petvax.org |
| Office app in `office/` (Next.js + TypeScript + Supabase + Tailwind) | Done | |
| Staff sign-in / sign-out | Done & tested | e2e |
| Password reset | Partial | Implemented (email link → set password); not tested end-to-end (needs email delivery) |
| Optional MFA (authenticator app) | Partial | Enroll/verify/remove implemented and enforced at sign-in; no automated test |
| Roles (admin / vet / front-desk staff) + RLS on every table | Done & tested | `tests/integration/rls.test.ts`; Supabase security advisor: no issues |
| Private file storage | Done & tested | 4 private buckets; anon/outsider download denied (tested) |
| Server-side validation, scoped public form tokens, no secret key in browser | Done & tested | Build scanned for the secret key: absent |
| Audit log (tamper-evident) | Done & tested | Hash-chained, immutable; chain verified after restore |
| Export | Done | Admin JSON export of all tables (Settings) |
| Client registration, multiple pets per submission | Done & tested | e2e (2 pets on iPhone) + integration |
| Returning-client updates / duplicate prevention / human review | Done & tested | Never merges on name alone; flagged records get a merge/keep-separate screen |
| Consent: exact text + version, signer, relationship, signature image + SHA-256, timestamp, IP/device, immutable, hash chain | Done & tested | Consent wording copied verbatim from the Jotform — **needs NY legal review** |
| Consent appears immediately, linked to the right pet | Done & tested | |
| Customizable forms with versioning | Done & tested | Visual builder, phone preview, draft/publish, version history (e2e) |
| Appointments: requested/confirmed/completed/canceled, clinician, address, notes, NY time display / UTC storage | Done & tested | DST-safe conversion tested |
| Scheduling conflict detection | Done & tested | Database exclusion constraint for confirmed visits + warnings for requests |
| Calendar | Partial | Week agenda view (works on phone); no month grid / drag-and-drop |
| Client confirmation & reminders | Partial | Record confirmation, pre-written text/email links, "due soon" list; **no automatic sending** |
| Vaccination records (all requested fields), history, traceable corrections | Done & tested | Records immutable; corrections supersede with a reason |
| SOAP notes: S/O/A/P, vitals with units, BCS with scale, draft → final → amendments, attribution | Done & tested | Every save kept as a revision |
| PDF certificates from saved records, numbered, stored, fingerprinted, downloadable/printable | Done & tested | Text extracted from the PDF is checked field by field |
| Certificate email to client | Partial | Gmail SMTP or Resend + delivery log; SMTP path tested end to end against a local mail catcher. Needs a Gmail app password (or Resend key) in Vercel |
| Copy of every submission and certificate to petvaxnyc@gmail.com | Done & tested (local mail catcher) | Same email setup required on Vercel |
| Never invent credentials/data | Done & tested | Issuing blocked without license number/credentials/required vaccine data |
| One-screen certificate (Certificates → New certificate) | Done & tested | Pick pet → tick vaccines (lots pre-filled) → one button records the visit + vaccines and issues the PDF. Unit, integration and browser tests |
| Rabies certificate legal requirements | **Needs review** | Separate NY rabies page modeled on PetVax's own form: owner, animal ID, manufacturer, product, lot/serial, duration, tag, next due, vet name + NY license, clinic, certification statement. Confirm against current NY State / NYC requirements |
| Jotform import with external ids, idempotent, signatures/files/raw JSON preserved, reconciliation report | Done & tested (synthetic data) | **Blocked for real data**: needs a read-only API key from the Jotform account that owns forms 262500538572052 and 262500542108042 |
| Backups & restore | Done & tested (local) | Restore drill proves identical data, chains, files |
| Production database | Done | Applied to the PetVax Supabase project after a verified backup (the old tables held no rows); security advisor shows no issues for Office tables. The 7 old empty tables still have RLS off (not touched) |
| Hosting / domain | Partial | Vercel project `petvax` (team dima-media) builds every push to this branch; behind Vercel login. No custom domain yet |
| Save every submission + certificate PDF to Google Drive, with index.csv | Done & tested (simulated Drive) | The real Apps Script code is executed in tests against an in-memory Drive and called over HTTP by the app. Needs the one-time setup in GOOGLE_DRIVE.md; not yet run against the real Drive |
| Staff accounts | Done | petvaxnyc@gmail.com (admin); Michael Christian Andersen (vet) — his credentials must be entered in Settings → Staff before he can sign; rabies certificates also need a license number (his own, or the supervising veterinarian's in Settings) |
| Retire Jotform | Not started (by design) | Only after real import is reconciled and signatures/attachments verified |
