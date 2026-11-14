# PetVax Office — isolated development application

**Status: development only; NOT deployed, NOT production-ready.** This lives in
\`office/\` on \`feature/petvax-office-supabase\`. Public marketing pages and
\`www.petvax.org\` are untouched. It is NOT proven to be the source of the separately
hosted @Sites PetVax Office app. Do not present it as a live replacement.

## Implemented in source (not end-to-end verified)
- Staff-only password login via Supabase Auth and active \`pvo_staff\` allowlist.
- Mobile-oriented owner and 1–6 pet registration form at \`/intake/<token>\`.
- Reusable token stored only as a SHA-256 digest; server reads versioned consent text.
- Typed electronic signature + explicit consent affirmation, timestamped,
  snapshot and evidence hash, immutable database row.
- Transactional intake write with client-generated idempotency key.
  First owner email creates owner and pet records. Repeated email is queued as
  \`needs_review\` with no automatic overwrite of existing records.
- Staff overview of intakes, owners, and pets at \`/office\`.
- Appointment request creation/listing and basic near-time conflict check.
- Visit SOAP draft editor: subjective/objective/assessment/plan, brief exam,
  temperature, HR, RR, weight, BCS (1–9) and up to 8 vaccine doses with
  manufacturer, lot, expiry, route, site, next-due date and reactions.
- Additive SQL migrations, role-specific RLS and relational integrity checks.

## Explicitly unfinished
- **No live Supabase verification:** PetVax project ref \`evfhsbeaepomoavivozw\`
  was inactive when discovered. Migrations are NOT applied.
- **Do not activate public intake links in production:** no robust distributed
  rate limiting/CAPTCHA, bot defense, email verification, practitioner-approved
  consent wording or formal signature-law review.
- Returning owner/pet duplicate reconciliation needs staff review UI and
  identity verification. Intake data for returning owners remains in pending queue.
- Staff creation is manual; no onboarding workflow or MFA enforcement.
- Appointment conflict check is not transactionally concurrency-safe. There is
  no two-way calendar integration or reminders.
- Clinical notes and vaccine entries are drafts only; no clinician finalization.
- No signed official vaccination certificate PDF or secure email delivery yet.
- No Jotform import, attachment/signature reconciliation, backup restore test,
  end-to-end testing, or production deployment.
- No automatic lockfile yet (offline development environment).
  Download the CI-generated lockfile artifact and commit it before deployment.

## Setup — staging only
1. Verify whether the original @Sites Office can export its DB/records.
   Audit the current \`PetVax\` Supabase schema and create a tested backup before
   touching production. Use a separate staging DB or safe local stack.
2. Use Node.js 22+. Run \`cd office && npm install\`, then commit generated
   \`package-lock.json\`. Run \`npm test && npm run lint && npm run build\`.
3. Copy \`.env.example\` to \`.env.local\`. Configure the Supabase URL and
   modern publishable key. Configure the SERVER-ONLY secret key via secure
   deployment secrets; never commit the value.
4. Review and apply migrations in filename order to an isolated staging database
   using your current Supabase CLI/documented migration workflow.
5. Create staff users in Supabase Authentication (do not enable public staff
   sign-up). Authorize a known account using an audited SQL command:
   \`insert into public.pvo_staff(user_id,role) values ('<verified auth.users.id>','admin');\`
6. Have licensed veterinary staff/legal counsel approve consent wording.
   Generate a strong random token locally:
   \`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"\`
   Calculate its SHA-256:
   \`node -e "console.log(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" <token>\`
   Add only the digest, approved text and version to \`pvo_public_forms\`. Leave
   \`active=false\` until anti-bot controls, privacy terms and testing are complete.
7. Run the application with \`npm run dev\` in staging. Staff visit \`/office\`;
   invited clients visit \`/intake/<token>\` once activated in a safe test setting.
   \`/api/intake\` uses a service-only RPC; NEVER call it from a direct public key
   or expose the server secret.
8. Test each end-to-end workflow, unauthorized access, import reconciliation,
   database backup/restore and iPhone/iPad layouts before promoting a release.

## Architecture and safeguards
- Application depends on a server capable of Next.js rendering and API routes.
  GitHub Pages serves the existing static marketing website only; it cannot host
  this app's server API. Choose a separate Office hostname after verification.
- Only staff Auth sessions can query clinical tables. RLS denies anonymous access.
  The public intake server accesses a minimal approved token and writes through
  a server-secret RPC. This is a transitional architecture; production abuse
  controls and tighter schema-scoped service permissions are required.
- Consent snapshots are immutable; clinical finalization is blocked by a database
  trigger until credentials and signed record workflows are implemented.
- Owner email matching is only a preliminary duplicate heuristic. Never infer
  authorization to update a pet simply from knowing an owner's email.
- Do not use real client information for staging or tests.
- Jotform must remain available until source records and attachments are
  reconciled, Jotform replacement features tested and owner approves retirement.
- Pricing discussed for public service: $75 visit includes one vaccine;
  each additional vaccine $75. Pricing is not currently automated in Office.

See \`docs/PETVAX_OFFICE_DISCOVERY.md\` and
\`docs/CLAUDE_CODE_PETVAX_OFFICE_PROMPT.md\` for the preservation plan.
