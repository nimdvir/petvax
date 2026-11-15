# Google Drive archive

Every form submission and every certificate is saved automatically to the **PetVax** Drive folder:

```
PetVax/
└── PetVax Office archive/
    ├── index.csv                      ← one line per saved file (date, type, client, pets, details, status, links, SHA-256)
    ├── Form submissions/2026/2026-11/
    │   └── 2026-11-15 0930 - Rivera, Dana - Rex & Miso - PetVax New Visit Form (70aa8d2a).pdf
    └── Certificates/2026/2026-11/
        └── PVX-2026-001001 - Rex - Rivera, Dana - 2026-11-15.pdf
```

- **Form submission PDFs** contain every answer, the exact consent wording, the drawn signature, the time, and the
  fingerprints (hashes) that prove the record wasn't changed.
- **Certificate PDFs** are the exact files stored in Office (byte-for-byte identical).
- Saving is automatic and never delays the client or the vet. Each attempt is listed in *Office → Settings → Google
  Drive archive*. If Drive was unreachable (or before setup), press **Save anything not yet in Drive** there.
- Saving the same record twice never creates duplicates.

## One-time setup (about 5 minutes)

The archive uses a tiny Google Apps Script that runs **as petvaxnyc@gmail.com** (which can edit the PetVax folder),
so no Google Cloud project or API keys are needed.

1. Sign in to Google as **petvaxnyc@gmail.com** and open <https://script.google.com> → **New project**.
   Name it `PetVax Office Drive archive`.
2. Delete the sample code and paste the whole file
   [`office/integrations/google-drive-archive.gs`](../integrations/google-drive-archive.gs). Save.
3. Make up a long random password (30+ characters; a password manager can generate one). Then:
   **Project Settings** (gear icon) → **Script properties** → **Add script property**:
   name `ARCHIVE_SECRET`, value = that password. Save.
4. **Deploy → New deployment** → type **Web app**:
   - *Execute as*: **Me (petvaxnyc@gmail.com)**
   - *Who has access*: **Anyone** (needed so Office's server can reach it; the password protects it, and it never
     returns any file contents)
   - Deploy, then **Authorize access**. Google shows "Google hasn't verified this app" because it's your own new script:
     **Advanced → Go to PetVax Office Drive archive** → Allow.
   - Copy the **Web app URL** (it ends in `/exec`).
5. In **Vercel → petvax → Settings → Environment Variables** add, for all environments:
   - `DRIVE_ARCHIVE_URL` = the Web app URL
   - `DRIVE_ARCHIVE_SECRET` = the same password as step 3 (mark it *Sensitive*)
   Then redeploy (or push any change).
6. Open **Office → Settings**: the Google Drive archive card shows *connected*. Press
   **Save anything not yet in Drive** to save earlier records.

If you ever change the script, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.
To stop archiving, remove `DRIVE_ARCHIVE_URL` in Vercel (files already in Drive stay there).
