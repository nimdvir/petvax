# Jotform migration

Source forms: **PetVax Client Intake Form - NEW** (`262500538572052`) and **PetVax Vaccination Consent Form - NEW**
(`262500542108042`). They belong to a Jotform account that is not the one connected to this work session, so the real
import has **not been run**. The importer is tested with synthetic submissions in the Jotform API format.

## What it does

- Reads submissions (read-only) from the Jotform API or a saved API export file.
- Maps answers by question text, so it keeps working if Jotform's internal field ids change.
- Files each submission through the same pipeline as Office forms: client/pet matching (same rules, ambiguous
  matches flagged), consent with the exact consent wording, signature image + SHA-256, original timestamp.
- Keeps the original: the raw submission JSON is stored as a document and inside the submission's answers;
  signatures and uploaded files (e.g. pet photos) are downloaded into private storage with checksums.
- Records the Jotform submission id; re-running never creates duplicates.
- Intake-form signatures (the "I certify" signature) are kept as documents, not as vaccination consents.
- Writes a reconciliation report: source count vs imported, already-imported, failed, flagged for review,
  consents created, consents missing a signature, files in source vs stored, plus an independent re-read of the
  destination to list any Jotform id missing from Office.

## Run it

```bash
cd office
export JOTFORM_API_KEY=...            # Jotform > Settings > API > create a READ-ONLY key
npm run jotform:import                # dry run: shows what would happen, writes nothing
npm run jotform:import -- --apply     # import; safe to repeat
```

Reports are saved in `import-reports/` (git-ignored; they contain client names).
EU or HIPAA Jotform accounts: set `JOTFORM_API_BASE=https://eu-api.jotform.com` (or `hipaa-api`).

## Verify before retiring Jotform

1. Report shows `Missing: none` and `Failed: 0` (or every failure explained).
2. Open a sample of imported consents in Office (pet page) and compare the signature image with Jotform's.
3. Resolve every "possible duplicate" in *Clients → Needs review*.
4. Download a Jotform export as an extra archive copy.
5. Only then turn off the Jotform forms.
