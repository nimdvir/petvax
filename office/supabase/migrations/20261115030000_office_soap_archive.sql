-- Allow archived finalized/amended SOAP note revisions alongside existing PDFs.
-- This is additive; it does not modify historical notes or any Jotform data.
alter table public.drive_archive_log
  drop constraint if exists drive_archive_log_kind_check;
alter table public.drive_archive_log
  add constraint drive_archive_log_kind_check
  check (kind in ('submission','certificate','soap'));
alter table public.drive_archive_log
  add column revision_no integer check (revision_no is null or revision_no > 0);
create index drive_archive_log_soap_revision_idx
  on public.drive_archive_log(kind,record_id,revision_no)
  where kind='soap' and status='saved';
