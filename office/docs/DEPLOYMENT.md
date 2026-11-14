# Deployment

Nothing has been deployed or applied to production. Do these steps yourself, in order.

## 1. Database (Supabase project "PetVax", `evfhsbeaepomoavivozw`)

Inspection on 2026-11-14 found 7 **empty** tables in `public` (`OWNER`, `PET`, `VETERINARIAN`, `APPOINTMENT`,
`SERVICE`, `APPOINTMENT_SERVICE`, `INVOICE`) with **Row Level Security disabled** (Supabase flags this as critical:
anyone with the project's public key can read and write them), no auth users, no storage buckets, no migrations.
The Office migrations don't touch those tables (Office tables are lowercase, e.g. `owners`).

1. Take a backup (Dashboard → Database → Backups) even though the project is empty.
2. Decide what to do with the legacy tables: drop them if unused, or at least enable RLS:
   `alter table public."OWNER" enable row level security;` (repeat for each).
3. Apply migrations from your machine:
   ```bash
   cd office
   npx supabase login            # use a token scoped to this project only
   npx supabase link --project-ref evfhsbeaepomoavivozw
   npx supabase db push          # shows the 4 migrations and asks to confirm
   ```
4. Auth settings (Dashboard → Authentication): turn **off** public sign-ups; set Site URL to the Office URL and add
   `https://<office-url>/auth/callback` to redirect URLs; enable TOTP MFA; configure custom SMTP so invitations and
   password resets are delivered reliably.
5. Run Security and Performance Advisors and resolve anything new.

## 2. App hosting (Vercel suggested)

1. New project from this repo, **Root Directory = `office`**, framework Next.js.
2. Environment variables from `.env.example` (production values). `SUPABASE_SECRET_KEY` must not have a `NEXT_PUBLIC_` prefix.
3. Domain: e.g. `office.petvax.org` → CNAME to Vercel. The public site stays on GitHub Pages at www.petvax.org.
4. After the first deploy:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... NEXT_PUBLIC_SITE_URL=https://office.petvax.org \
     npm run create-admin -- --email <you> --name "<Your name>"      # sends an invitation
   ```
   Sign in → *Forms* → *Install default forms* → copy the New Visit link.
5. In *Settings*, fill in phone/contact details; in *Settings → Staff*, add each vet's credentials and license number.
6. Optional: `RESEND_API_KEY` + a verified sending domain for certificate email.

## 3. Switching from Jotform

Run the Jotform import (see JOTFORM_MIGRATION.md), review the reconciliation report, spot-check signatures, and only
then replace Jotform links (website "Book" page, texts, email templates) with Office links. Keep the Jotform account
until you are satisfied — nothing in Office deletes or changes Jotform data.

## Rollback

The app has no effect on the public site. To roll back the app, redeploy the previous Vercel deployment or disable it.
Database migrations only add new objects; to remove them entirely, restore the pre-migration backup (step 1.1).
