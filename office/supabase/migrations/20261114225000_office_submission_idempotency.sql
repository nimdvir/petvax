-- Each form page load sends a random submission key. A double-tap or a retry after a
-- dropped connection reuses the key, so the submission is only saved once.
alter table public.intake_submissions add column idempotency_key uuid;
create unique index intake_submissions_idempotency_uidx on public.intake_submissions (idempotency_key) where idempotency_key is not null;
