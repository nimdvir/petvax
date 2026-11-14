# Claude Code implementation prompt: PetVax Office

You are a senior full-stack engineer tasked with IMPLEMENTING (not merely designing) a production-ready, standalone PetVax Office for a New York City house-call pet vaccination business.

## Repositories, deployments and constraints
- Existing GitHub repository: https://github.com/nimdvir/petvax
- Use a NEW branch, never commit directly to main.
- Main currently holds the public static marketing website with CNAME `www.petvax.org`. Preserve its HTML, public URLs, Google Tag Manager configuration and existing booking links until the replacement is verified.
- Existing PetVax Office may be hosted separately as a ChatGPT Sites application. DO NOT assume the GitHub repository is the source of that app. Investigate deployment ownership and architecture before promising to preserve its database, site address or records. Document any migration boundary.
- A linked Supabase project called `PetVax` exists (project ref `evfhsbeaepomoavivozw`), but it was INACTIVE when checked on 2026-11-14. Do NOT create a replacement project or alter its production data without inspecting it, backing it up, and confirming the existing application's actual connection. Do not print credentials.
- Goal: completely eliminate Jotform ONLY AFTER migration, parity, signature and certificate validation, and user acceptance. Retain read-only Jotform integration/archive during transition.
- Domain: house-call vaccinations with a brief pre-vaccination examination ONLY, not general veterinary medicine.

## Required working capabilities
1. Responsive secure PetVax Office dashboard with login, strong authentication, role-based staff/administrator access, appointments, owner/pet search, history, status, filters and mobile/iPad support.
2. Owner accounts/contact details and multiple pets per owner, addresses, optional emergency contacts, species/breed/sex/age/DOB/microchip/weight, known vaccine history, allergies, contraindications. Minimize required fields. Support editing and duplicate-merge workflows that preserve source provenance.
3. Reusable PUBLIC client intake, registration, pre-visit questionnaire and vaccine consent links. Offer one link for new clients and scoped per-appointment invitations. Client flow: enter owner + one/multiple pets -> review consent -> sign -> confirmation. Real database writes, idempotent submissions, anti-spam/rate limiting, private form tokens, expiration/revocation for sensitive links. Never expose raw admin APIs or pet histories through a publicly reusable link.
4. Explicit vaccination consent wording (reviewed by the business's veterinarian/legal counsel), signature drawing or typed electronic signature as legally appropriate, signer's printed name, relationship to animal, signed UTC timestamp, consent-text version + immutable snapshot/hash, IP/user-agent where lawful, and tamper-evident audit event. Do not claim legal compliance merely because a checkbox exists. Retain original signed evidence in private storage.
5. House-call appointment request, scheduling and statuses (requested, confirmed, completed, canceled), conflict checking, timezone `America/New_York`, address/contact, pet linkage and staff notes; don't claim availability without checking actual schedule.
6. Vaccination event per administered dose: vaccine name/type, manufacturer, product, lot/serial number, administration route/site, administered date/time, expiration date, next-due date, administering licensed professional/credential, adverse reactions, patient, owner, appointment. Include pricing only where applicable: $75 for a visit including one vaccine and $75 for each additional vaccine, but don't charge automatically unless explicitly configured.
7. Structured SOAP notes (Subjective, Objective, Assessment, Plan) tied to the encounter, including brief exam, temperature with units, heart rate, respiratory rate, weight, numerical body condition score (with scale), general observations, reactions and follow-up. Clearly distinguish owner statements from clinician observations; support drafts and signed/finalized immutable revisions.
8. Generate professionally formatted, downloadable PetVax vaccine certificate PDFs from the saved encounter data; no manual re-entry. Include business/practitioner credentials, animal and owner details, vaccination dates, vaccine/manufacturer/lot details, next due dates, certificate ID and issued date. Apply appropriate signature/verification process; do NOT invent veterinarian signatures/license numbers or label legally insufficient certificates as official.
9. Secure PDF/email workflow with verified destination and delivery status, no records exposed in public URLs, and a private attachments archive. Make email sending opt-in/reviewed if not configured.
10. Audit history, CSV/JSON/PDF export, restore-capable backups, reasonable retention and deletion policies, user-scoped access with least privilege. Provide migrations and repeatable setup docs.

## Suggested architecture (adapt after code inspection)
- Preserve existing public static website. Put Office under a separate directory/app or deployment (e.g., `office/`), not replace `index.html` or CNAME.
- Prefer a maintained TypeScript framework with server-side routes, Supabase Auth/Postgres/Storage, SQL migrations, type-safe data access, server-side PDF generation and tests. Explain hosting and path/domain strategy. Never depend on browser-only secrets.
- Use existing Supabase project ONLY after verifying whether it already backs the original Office. No duplicate production database. If separate app database cannot be accessed, implement an adapter/import plan rather than assuming records are migrated.
- Proposed entities, adjusted to any existing schema: organizations, staff_profiles, owners, pets, pet_owner_links, appointments, encounters, examination_vitals, vaccinations, consent_templates, consents, signatures/evidence, certificates, documents, form_tokens, intake_submissions, import_batches, external_source_mappings, audit_events, communication_deliveries.
- Use UUID primary keys, foreign keys, uniqueness/idempotency keys, constraints, indexed search and timestamps. Store all UTC, display local time. Soft delete when clinically/audit appropriate.
- Apply RLS on EVERY exposed table, least-privilege policies, ownership/role checks on every read/write and storage path, no blanket `authenticated` access. Do not use user-editable metadata for authorization. Never expose Supabase service role keys on the client. Public forms should use minimal-permission server endpoints/Edge Functions with validation, CSRF/abuse protections, scoped tokens and replay defenses.
- Private object storage, signed short-lived download links, secure email attachments, encryption in transit, key rotation/documented secrets handling, backups tested by restore.
- Separate nonproduction test fixtures and environments. Pin dependency versions and lockfiles.
- Follow current Supabase docs and changelog: https://supabase.com/changelog.md (Supabase CLI v3 has recent breaking changes). Run schema/RLS/security advisors and actual integration tests.

## Jotform migration — safe and verifiable
- INVENTORY all source forms, answers, signed forms, attached files, certificates, owner and pet relationships, and historical records before importing.
- Export or API retrieve read-only, keep originals and timestamps; do not delete or alter source records.
- Staging import with dry run, deterministic source IDs, idempotent upsert and per-record outcome tracking. Match owners using more than name alone, pets by owner and multiple identifiers; flag ambiguous matches for human review rather than auto-merge.
- Store external IDs, form/version, raw immutable source artifact references and import errors.
- Produce reconciliation report: source counts, imported counts, exact matches, new records, duplicates flagged, attachments/signatures verified, missing records and checksums. Re-run safely.
- Keep Jotform until real-end-to-end acceptance testing succeeds and the owner authorizes retirement.

## User flows and acceptance tests
A. New owner opens reusable link on iPhone -> registers two pets -> submits consent and signature -> database has one owner, two linked pets, stored immutable signature and submission receipt -> Office dashboard shows all.
B. Returning owner uses appointment-scoped link -> updates one pet -> no duplicated owner/pet.
C. Staff confirms house call, records pre-vaccine examination + numeric BCS + vitals, vaccine manufacturer/lot/expiry/site/route, clinical notes and reaction -> save and reopen yields exact values.
D. Staff finalizes encounter -> downloadable PDF is accurate, branded, linked to saved pet/appointment and not publicly accessible; appropriate signature and licensed credentials are present.
E. Consent text revisions do not rewrite already signed records, and timestamp/audit trail survive.
F. A random unauthenticated user, another staff user without authorization, and malicious form submitter cannot read/edit unrelated data or download private files; validate RLS and API security with negative tests.
G. Mobile browser tests at iPhone/iPad sizes, accessibility/keyboard checks, form validation, failed network retries and attachment handling.
H. Jotform dry run, import then repeat import -> no duplicates; reconciliation and attachments audit pass.
I. Back up test dataset and perform a real restore drill.
J. Existing public marketing site continues to work and GitHub Pages custom domain remains unchanged.
Do NOT report a feature 'working' unless verified against a real nonproduction database and integration test, not just mocked UI.

## Execution order
1. Audit repository and actual existing Office deployment. Map current hosting/database and inventory integrations; identify any missing access.
2. Document architecture and record-preservation risks. Inventory Supabase schema and back up before any hosted write. Avoid destructive actions.
3. Scaffold Office app in its own folder and define versioned database migrations, auth/RLS and private storage.
4. Implement and test owner/pet CRUD, secure public form flow, consent/signature, appointment scheduling, encounter/vaccine/SOAP records, PDF generation.
5. Build Jotform read-only import and reconciliation.
6. Add tests, security/advisor results, release checklist, environment samples and rollback steps.
7. Open a DRAFT PR on your feature branch. Never merge or deploy production automatically. Report exactly which flows passed, failed or are blocked; link tests and screenshots where useful.

## Final deliverables
- Actual running code committed in branch, migrations, tests, clear setup docs, sample env vars (not secrets).
- Draft PR and implementation checklist.
- Deployment/connection checklist for Supabase and existing Office/marketing domain.
- Evidence-based status matrix: implemented/tested, partial, blocked, not started, and the Jotform import verification counts.
- Never claim it is production-ready or that Jotform is retired until end-to-end acceptance and explicit user signoff.
