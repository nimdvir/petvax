# PetVax Office development branch — discovery

Date: 2026-11-14

## Verified
- Repository `nimdvir/petvax` exists and its default branch is `main`.
- GitHub root contains a static marketing site (`index.html`, `book.html`, confirmation HTML pages) and `CNAME` = `www.petvax.org`.
- Its README points to GitHub Pages and specifies Google Tag Manager `GTM-NHCC2BZN` on new site pages.
- No identifiable Office application, Supabase config, package manifest or migrations appeared in the recursive path inventory.
- A connected Supabase project named `PetVax` (ref `evfhsbeaepomoavivozw`) exists but is INACTIVE, and list_tables returned "Database is possibly not accessible at the moment".
- The separate existing @Sites PetVax Office deployment has not been verified as originating from this GitHub repository.

## Safety boundaries
- Do not modify `main`, public website, CNAME, production Jotform, or production Supabase until deployment/data mapping and backups are verified.
- Development will use the separate `feature/petvax-office-supabase` branch and additive `office/` architecture.
- The Claude Code implementation brief is in `docs/CLAUDE_CODE_PETVAX_OFFICE_PROMPT.md`.
- No working Office screens, migrations, data import, live tests or deployment are claimed by these planning documents.

## Blocking prerequisites for production
1. Verify original @Sites Office deployment and database/export mechanism.
2. Restore/reactivate existing PetVax Supabase project if that is the correct database, after confirming implications.
3. Confirm licensed practitioner identity and legally appropriate certificate/consent language.
4. Obtain read-only Jotform import credentials and sample exports securely (never commit secrets).
5. Establish staging deployment and nonproduction test database, then implement and verify all workflows.

## Live Supabase read-only recheck — 2026-11-14

Project `evfhsbeaepomoavivozw` is now `ACTIVE_HEALTHY`, and schema reads succeed.

Seven existing public tables were inventoried: `OWNER`, `PET`, `VETERINARIAN`, `APPOINTMENT`, `SERVICE`, `APPOINTMENT_SERVICE`, and `INVOICE`. These are independent of the additive `pvo_*` schema designed on the feature branch.

Verified exact counts for four existing tables using read-only SQL:
- `OWNER`: 0
- `PET`: 0
- `APPOINTMENT`: 0
- `VETERINARIAN`: 0

Supabase migration history is empty. **This does not verify that the original @Sites Office or Jotform records are present; they may reside in a different database or application.**

**Critical advisory:** All seven existing public tables have RLS disabled, per Supabase security advisor. Do not place real customer data into these tables until authorization policies have been designed and verified. Do not blindly enable RLS without compatible policies because this can break existing app access. See https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public.

**Writes:** None. The PetVax Office migration files have NOT been applied, and no records/keys were created, changed or deleted.

Before connecting staging to this database, verify original Office provenance and backups. Before enabling client intake, implement abuse prevention, review legal consent and obtain an approved deployment plan.
