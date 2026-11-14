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
