-- Address that receives a copy of every form submission and every issued certificate.
alter table public.app_settings add column notify_email text
  check (notify_email is null or notify_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
update public.app_settings set notify_email = 'petvaxnyc@gmail.com' where id and notify_email is null;
