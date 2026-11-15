# office.petvax.org — final DNS step

Vercel project: `petvax` in team `dima-media` (project id `prj_vV8qCLLrojUDDsqDXG7dXMA7nRHM`).
Domain `office.petvax.org` is already attached to this project and is assigned to
the Git branch `claude/kind-goldberg-6j05xb`. Vercel reports ownership verified,
but the DNS configuration was **misconfigured** during the last check.

The `petvax.org` authoritative nameservers are Namecheap
(`dns1.registrar-servers.com`, `dns2.registrar-servers.com`).
The connected Namecheap app can only check domain registration availability;
it cannot change this domain's DNS zone.

## One manual action in Namecheap

Domain List → `petvax.org` → Manage → Advanced DNS → Host Records → Add New Record

| Type | Host | Target | TTL |
|---|---|---|---|
| CNAME | `office` | `3e7ae617aa53aa07.vercel-dns-016.com` | Automatic |

Vercel also lists `cname.vercel-dns.com` as a secondary fallback; use the
unique hostname above first. Do not alter the root `@` or `www` records
or change the registrar nameservers, because `www.petvax.org` must continue
to serve the existing public website.

Wait for Vercel → Project → Domains → `office.petvax.org` to report
**Valid Configuration**, and verify loading the actual HTTPS login screen.
Do not treat a `verified:true` domain ownership response as proof that the
DNS or HTTPS routing is live.

## After DNS resolves

1. Set `NEXT_PUBLIC_SITE_URL=https://office.petvax.org` in the correct Vercel
   project environment(s); redeploy, without exposing any secrets.
2. In Supabase Auth configure Site URL and additional redirect URL
   `https://office.petvax.org/auth/callback` for staff invitations and resets.
3. Test a staff login, logout, password reset, and restricted access.
4. Set up the PetVax Drive archive as `petvaxnyc@gmail.com` per
   `docs/GOOGLE_DRIVE.md`. This requires a personal one-time Apps Script
   authorization and private `DRIVE_ARCHIVE_URL` / `DRIVE_ARCHIVE_SECRET`
   in Vercel. That authorization has not been completed automatically.
5. Configure authenticated outbound email in Vercel if email delivery is needed.
6. Keep Jotform running until historic owners, pets, documents and signatures
   have been reconciled and one real-world replacement workflow passes.

This subdomain assignment tracks the feature branch for review; the draft PR
has not been merged into main. Do not represent the Office integration as
production-complete until final checks and handoff are signed off.
