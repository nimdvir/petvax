-- Record of every attempt to save a submission or certificate PDF into the Google Drive archive.
create table public.drive_archive_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('submission', 'certificate')),
  record_id uuid not null,
  file_name text not null,
  folder text not null,
  status text not null check (status in ('saved', 'failed', 'not_configured')),
  drive_url text,
  error text,
  created_at timestamptz not null default now()
);
create index drive_archive_log_record_idx on public.drive_archive_log (kind, record_id);
create index drive_archive_log_time_idx on public.drive_archive_log (created_at desc);

alter table public.drive_archive_log enable row level security;
revoke all on public.drive_archive_log from anon, authenticated, public;
grant select, insert on public.drive_archive_log to service_role;
grant select on public.drive_archive_log to authenticated;
create policy "admins read drive archive log" on public.drive_archive_log for select to authenticated
  using ((select private.has_role('{admin}')));
