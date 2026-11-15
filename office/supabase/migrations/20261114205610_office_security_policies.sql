-- PetVax Office security: role helpers, grants, Row Level Security, private storage.
-- Access model:
--   * anon (public)          : no table access at all. Public forms go through server
--                              endpoints that validate a scoped link token.
--   * authenticated non-staff: no access (a signed-in user without an active staff profile sees nothing).
--   * staff                  : front desk — clients, pets, appointments, submissions; read clinical records.
--   * vet                    : staff + SOAP notes, vaccinations, certificates.
--   * admin                  : everything, including forms, settings, staff accounts, audit log.

create or replace function private.current_staff_role()
returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select role from public.staff_profiles
  where user_id = (select auth.uid()) and active
$$;

create or replace function private.has_role(roles public.staff_role[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.current_staff_role()) = any (roles), false)
$$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.current_staff_role()) is not null
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.current_staff_role() to authenticated, service_role;
grant execute on function private.has_role(public.staff_role[]) to authenticated, service_role;
grant execute on function private.is_staff() to authenticated, service_role;
grant execute on function private.verify_audit_chain() to service_role;
-- Used by a generated column on owners, so it runs with the caller's privileges.
grant execute on function private.digits_only(text) to authenticated, service_role;

revoke all on function public.next_certificate_number() from public, anon;
grant execute on function public.next_certificate_number() to authenticated, service_role;
grant usage, select on sequence public.certificate_number_seq to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Table privileges (new tables are not exposed to the Data API automatically)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  office_tables text[] := array['staff_profiles', 'owners', 'pets', 'pet_owners', 'form_templates', 'form_versions',
    'form_links', 'appointments', 'appointment_pets', 'intake_submissions', 'signed_consents', 'encounters',
    'soap_notes', 'soap_note_revisions', 'vaccine_products', 'vaccinations', 'certificates',
    'certificate_vaccinations', 'email_deliveries', 'documents', 'external_ids', 'import_runs',
    'app_settings', 'audit_events'];
begin
  foreach t in array office_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Write privileges for signed-in users (RLS below decides which rows/roles). No deletes are granted.
grant insert, update on public.owners, public.pets, public.pet_owners, public.appointments,
  public.encounters, public.soap_notes, public.vaccinations, public.certificates, public.documents,
  public.form_templates, public.form_versions, public.form_links, public.app_settings,
  public.staff_profiles, public.vaccine_products, public.intake_submissions to authenticated;
grant insert on public.appointment_pets, public.certificate_vaccinations, public.email_deliveries to authenticated;
grant delete on public.appointment_pets, public.form_versions to authenticated;
grant usage on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- staff_profiles
create policy "staff can view staff directory" on public.staff_profiles for select to authenticated
  using ((select private.is_staff()) or user_id = (select auth.uid()));
create policy "admins add staff" on public.staff_profiles for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "admins manage staff" on public.staff_profiles for update to authenticated
  using ((select private.has_role('{admin}'))) with check ((select private.has_role('{admin}')));

-- Client & scheduling tables: any active staff member
do $$
declare
  t text;
begin
  foreach t in array array['owners', 'pets', 'pet_owners', 'appointments', 'appointment_pets', 'encounters', 'documents'] loop
    execute format('create policy "staff read %1$s" on public.%1$I for select to authenticated using ((select private.is_staff()))', t);
    execute format('create policy "staff add %1$s" on public.%1$I for insert to authenticated with check ((select private.is_staff()))', t);
  end loop;
  foreach t in array array['owners', 'pets', 'pet_owners', 'appointments', 'encounters', 'documents'] loop
    execute format('create policy "staff edit %1$s" on public.%1$I for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()))', t);
  end loop;
end $$;
create policy "staff remove appointment pets" on public.appointment_pets for delete to authenticated
  using ((select private.is_staff()));

-- Intake submissions: created by the server endpoint (service role); staff review them.
create policy "staff read submissions" on public.intake_submissions for select to authenticated
  using ((select private.is_staff()));
create policy "staff review submissions" on public.intake_submissions for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- Signed consents: read-only for staff; immutable by trigger.
create policy "staff read consents" on public.signed_consents for select to authenticated
  using ((select private.is_staff()));

-- SOAP notes: vets and admins write; all staff read.
create policy "staff read soap" on public.soap_notes for select to authenticated
  using ((select private.is_staff()));
create policy "clinicians write soap" on public.soap_notes for insert to authenticated
  with check ((select private.has_role('{vet,admin}')));
create policy "clinicians edit soap" on public.soap_notes for update to authenticated
  using ((select private.has_role('{vet,admin}'))) with check ((select private.has_role('{vet,admin}')));
create policy "staff read soap revisions" on public.soap_note_revisions for select to authenticated
  using ((select private.is_staff()));

-- Vaccine catalog
create policy "staff read vaccine products" on public.vaccine_products for select to authenticated
  using ((select private.is_staff()));
create policy "clinicians add vaccine products" on public.vaccine_products for insert to authenticated
  with check ((select private.has_role('{vet,admin}')));
create policy "clinicians edit vaccine products" on public.vaccine_products for update to authenticated
  using ((select private.has_role('{vet,admin}'))) with check ((select private.has_role('{vet,admin}')));

-- Vaccinations: clinicians record; front-desk staff may only record history given elsewhere.
create policy "staff read vaccinations" on public.vaccinations for select to authenticated
  using ((select private.is_staff()));
create policy "clinicians record vaccinations" on public.vaccinations for insert to authenticated
  with check ((select private.has_role('{vet,admin}'))
              or ((select private.is_staff()) and administered_elsewhere));
create policy "clinicians void vaccinations" on public.vaccinations for update to authenticated
  using ((select private.has_role('{vet,admin}'))) with check ((select private.has_role('{vet,admin}')));

-- Certificates: only a vet can issue, and only in their own name.
create policy "staff read certificates" on public.certificates for select to authenticated
  using ((select private.is_staff()));
create policy "vets issue certificates" on public.certificates for insert to authenticated
  with check ((select private.has_role('{vet}')) and issued_by = (select auth.uid()));
create policy "clinicians update certificates" on public.certificates for update to authenticated
  using ((select private.has_role('{vet,admin}'))) with check ((select private.has_role('{vet,admin}')));
create policy "staff read certificate items" on public.certificate_vaccinations for select to authenticated
  using ((select private.is_staff()));
create policy "vets add certificate items" on public.certificate_vaccinations for insert to authenticated
  with check ((select private.has_role('{vet}')));

create policy "staff read deliveries" on public.email_deliveries for select to authenticated
  using ((select private.is_staff()));
create policy "staff log deliveries" on public.email_deliveries for insert to authenticated
  with check ((select private.is_staff()) and sent_by = (select auth.uid()));

-- Forms: everyone on staff can see them; admins edit.
create policy "staff read form templates" on public.form_templates for select to authenticated
  using ((select private.is_staff()));
create policy "admins add form templates" on public.form_templates for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "admins edit form templates" on public.form_templates for update to authenticated
  using ((select private.has_role('{admin}'))) with check ((select private.has_role('{admin}')));
create policy "staff read form versions" on public.form_versions for select to authenticated
  using ((select private.is_staff()));
create policy "admins add form versions" on public.form_versions for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "admins edit form versions" on public.form_versions for update to authenticated
  using ((select private.has_role('{admin}'))) with check ((select private.has_role('{admin}')));
create policy "admins delete draft versions" on public.form_versions for delete to authenticated
  using ((select private.has_role('{admin}')) and status = 'draft');
create policy "staff read form links" on public.form_links for select to authenticated
  using ((select private.is_staff()));
create policy "staff create form links" on public.form_links for insert to authenticated
  with check ((select private.is_staff()));
create policy "staff revoke form links" on public.form_links for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- Settings, imports, audit
create policy "staff read settings" on public.app_settings for select to authenticated
  using ((select private.is_staff()));
create policy "admins edit settings" on public.app_settings for update to authenticated
  using ((select private.has_role('{admin}'))) with check ((select private.has_role('{admin}')));
create policy "admins insert settings" on public.app_settings for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "admins read external ids" on public.external_ids for select to authenticated
  using ((select private.has_role('{admin}')));
create policy "admins read import runs" on public.import_runs for select to authenticated
  using ((select private.has_role('{admin}')));
create policy "admins read audit log" on public.audit_events for select to authenticated
  using ((select private.has_role('{admin}')));

-- ---------------------------------------------------------------------------
-- Private storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('consent-signatures', 'consent-signatures', false, 1048576, array['image/png', 'image/jpeg', 'image/svg+xml']),
  ('certificates', 'certificates', false, 10485760, array['application/pdf']),
  ('documents', 'documents', false, 26214400, null),
  ('staff-signatures', 'staff-signatures', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "staff read office files" on storage.objects for select to authenticated
  using (bucket_id in ('consent-signatures', 'certificates', 'documents', 'staff-signatures')
         and (select private.is_staff()));
create policy "vets store certificates" on storage.objects for insert to authenticated
  with check (bucket_id = 'certificates' and (select private.has_role('{vet}')));
create policy "staff upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_staff()));
create policy "admins upload staff signatures" on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-signatures' and (select private.has_role('{admin}')));
