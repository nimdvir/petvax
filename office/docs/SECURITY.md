# Security model

- **Who sees what:** signed-out visitors and signed-in users without an active staff profile get nothing (enforced in
  the database by Row Level Security, not just the UI). Front-desk staff manage clients, pets, appointments and
  submissions and can read clinical records. Vets also write SOAP notes and vaccinations and are the only ones who can
  issue certificates — in their own name. Admins manage forms, settings, staff and can read the audit log.
- **Public forms** never return client data. Each link is a random token (only its hash is stored for personal
  links); submissions go to a server endpoint that validates every answer against the published form, ignores bot
  submissions, and throttles repeats. Revoked/expired links stop working immediately.
- **Secrets:** the Supabase secret key is server-only (never `NEXT_PUBLIC_`); verified absent from browser bundles.
- **Records that can't be altered:** signed consents, SOAP revisions and the audit log reject updates and deletes
  even from the server key. Vaccinations and certificates can only change status (correct/void with a reason).
  Consents and audit events are hash-chained, so any edit made directly in the database is detectable.
- **Files** are in private buckets; staff view them through short-lived signed links.
- **Sessions:** Supabase Auth cookies, JWT verified on every request (`getClaims`), optional authenticator-app MFA,
  deactivated staff lose all data access immediately (their profile is inactive, so Row Level Security returns nothing).
- **Headers:** HSTS, no framing, no sniffing; app pages are `noindex`.
