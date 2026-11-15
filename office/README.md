# PetVax Office

The private staff app for PetVax house-call vaccinations: client forms with e-signatures, clients and pets,
appointments, pre-vaccination exams (SOAP), vaccine records, and one-click PDF vaccine certificates. Finalized SOAP notes and amendments are also archived to Drive as separate PDFs once Drive is configured.
It replaces Jotform. The public website (repo root, www.petvax.org) is separate and unchanged.

**Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Postgres, Auth, Storage) · Tailwind CSS · pdf-lib · Vitest · Playwright

## The everyday workflow

1. **Client fills one link on their phone** — *Forms* page → copy the "PetVax New Visit Form" link (or send a personal link from a client/appointment page). Owner, any number of pets, health questions, consent and a finger-drawn signature.
2. **It files itself** — the client, pets, signed consent and a visit request appear instantly. Returning clients are matched by email+phone (never by name alone); unclear matches are flagged for review, never merged automatically.
3. **Schedule** — *Appointments* → open the request → set date/time/clinician → *Confirm*. Overlaps for the same clinician are blocked.
4. **Exam** — on the appointment, *Start exam* per pet. The SOAP note is pre-filled with what the client told you.
5. **Vaccines** — pick the vaccine; manufacturer/lot/expiry pre-fill from the last vial you used and the next-due date is calculated.
6. **Certificate** — *Sign & generate certificate*. The PDF is built from the saved records, numbered (PVX-YYYY-NNNNNN), stored privately and fingerprinted. Download/print or email it to the client.
7. Everything stays on the pet's history page.

### Fastest way to a certificate (one screen)

*Certificates → New certificate* (also on the home page and on every pet page):

1. Tap one of **today's patients**, or search by pet name, client name or phone.
2. **Tick the vaccines given.** Manufacturer, lot, vial expiry, route and site fill in from the last vial used; the next-due
   date follows the duration. Vaccines the client asked for are pre-ticked. Optional notes print on the certificate.
3. **Sign & create certificate.** This records the visit and the vaccines and issues the signed PDF in one step. Nothing is
   saved if anything required is missing. A copy is emailed to the office and saved to Google Drive automatically.

Earlier doses of the same vaccine (puppy/kitten series) print on the certificate, and each rabies vaccine also gets a
**New York rabies certificate page** laid out like PetVax's existing form. The full exam workflow above is still there
when you want a complete SOAP note.

## Customizing forms (no code)

*Forms → Edit form*: rename questions, add/remove/reorder questions and sections, change answer types and choices,
make questions conditional ("only show when…"), choose which client/pet field an answer saves to, and edit the consent wording.
*Preview (phone)* shows exactly what clients will see. *Save draft* keeps changes private; *Publish* makes them live as a new
version. Old submissions and signatures always keep the exact version and consent text the client saw.

## Customizing certificates

*Settings*: business name, contact details (the address and phone print on rabies certificates), footer text, accent color,
and the **supervising veterinarian** (name + license number) printed next to the signer. *Settings → Staff*: each
clinician's credentials (e.g. DVM, or LVT, VTS), license number and (optional) signature image — enter these from the
license; the app never fills them in. A technician without their own license number can sign certificates; a rabies
certificate additionally needs a licensed veterinarian on it (their own license or the supervising veterinarian's).
A certificate can't be issued while required data is missing (manufacturer, lot/serial, rabies duration, licensed vet…);
optional details that are missing print as "Not recorded".

## Local development

```bash
cd office
npm ci
npm run db:start                 # local Supabase in Docker (test data only)
npx supabase status -o env       # copy API URL / publishable / secret keys into .env.local (see .env.example)
npm run create-admin -- --email you@example.com --name "Your Name" --password 'a-long-password'
npm run seed:forms               # installs the forms rebuilt from Jotform and prints their links
npm run dev
```

## Tests

| Command | What it checks |
|---|---|
| `npm test` | Form validation, record matching, time zones, Jotform mapping, PDF content (text extracted from the generated PDF) |
| `npm run test:integration` | Against the local database: Row Level Security for every role, intake/consent persistence and immutability, duplicate handling, appointments, SOAP revisions, vaccine corrections, certificate issuing, audit chain, Jotform import idempotency |
| `npm run build && npm run test:e2e` | Real browser: client fills the form on an emulated iPhone; vet schedules, examines, vaccinates, issues and emails a certificate; admin edits and publishes a form; iPad layout |
| `scripts/restore-drill.sh` | Backs up, wipes, restores, and proves every row, hash chain, signature and PDF is identical |

## More

- [docs/STATUS.md](docs/STATUS.md) — what is done, tested, partial or blocked
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — going live
- [docs/BACKUP.md](docs/BACKUP.md) — backups, restore and rollback
- [docs/JOTFORM_MIGRATION.md](docs/JOTFORM_MIGRATION.md) — importing and verifying Jotform history
- [docs/SECURITY.md](docs/SECURITY.md) — access model and safeguards
- [docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md) — automatic Google Drive archive of submissions and certificates
