-- Allow archived finalized/amended SOAP note revisions alongside existing PDFs.
-- This is additive; it does not modify historical notes or any Jotform data.
alter table public.drive_archive_log
  drop constraint if exists drive_archive_log_kind_check;
alter table public.drive_archive_log
  add constraint drive_archive_log_kind_check
  check (kind in ('submission','certificate','soap'));
