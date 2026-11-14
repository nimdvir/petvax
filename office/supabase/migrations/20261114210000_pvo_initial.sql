-- PetVax Office additive schema. REVIEW against existing database before applying.
-- This migration is NOT applied to the inactive PetVax project.
-- Prefix pvo_ prevents collisions with unrelated existing public tables.

create table if not exists public.pvo_staff (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pvo_owners (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  email text not null unique check (email = lower(btrim(email))),
  phone text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pvo_pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.pvo_owners(id) on delete restrict,
  name text not null,
  species text not null check (species in ('dog','cat')),
  breed text,
  sex text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists pvo_pets_owner_idx on public.pvo_pets(owner_id);

create table if not exists public.pvo_public_forms (
  id uuid primary key default gen_random_uuid(),
  token_digest text not null unique check (length(token_digest) = 64),
  consent_version text not null,
  consent_text text not null,
  active boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pvo_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.pvo_public_forms(id) on delete restrict,
  submission_key uuid not null,
  owner_id uuid references public.pvo_owners(id) on delete restrict,
  contact_email text not null,
  payload jsonb not null,
  status text not null check (status in ('accepted','needs_review','reviewed')),
  created_at timestamptz not null default now(),
  unique (form_id, submission_key)
);
create index if not exists pvo_submissions_recent_idx on public.pvo_intake_submissions(created_at desc);

create table if not exists public.pvo_consents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.pvo_intake_submissions(id) on delete restrict,
  owner_id uuid references public.pvo_owners(id) on delete restrict,
  signed_name text not null,
  consent_version text not null,
  consent_text_snapshot text not null,
  signed_at timestamptz not null default now(),
  evidence_sha256 text not null check (length(evidence_sha256) = 64)
);

create table if not exists public.pvo_appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.pvo_owners(id) on delete restrict,
  pet_id uuid references public.pvo_pets(id) on delete restrict,
  scheduled_at timestamptz not null,
  visit_address text not null,
  status text not null default 'requested'
    check (status in ('requested','confirmed','completed','canceled')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists pvo_appointments_time_idx on public.pvo_appointments(scheduled_at);

create table if not exists public.pvo_encounters (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.pvo_appointments(id) on delete restrict,
  pet_id uuid not null references public.pvo_pets(id) on delete restrict,
  clinician_id uuid references public.pvo_staff(user_id) on delete restrict,
  temp_c numeric(4,1),
  heart_rate_bpm integer check (heart_rate_bpm between 0 and 400),
  respiratory_rate_bpm integer check (respiratory_rate_bpm between 0 and 200),
  weight_kg numeric(7,2) check (weight_kg > 0),
  bcs_score integer check (bcs_score between 1 and 9),
  bcs_scale text check (bcs_scale in ('1-9')),
  subjective text,
  objective text,
  assessment text,
  plan text,
  reactions text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  check ((bcs_score is null and bcs_scale is null) or
         (bcs_score is not null and bcs_scale = '1-9'))
);
create index if not exists pvo_encounters_pet_idx on public.pvo_encounters(pet_id,created_at desc);

create table if not exists public.pvo_vaccinations (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.pvo_encounters(id) on delete restrict,
  pet_id uuid not null references public.pvo_pets(id) on delete restrict,
  vaccine_name text not null,
  manufacturer text,
  lot_number text not null,
  product_expires_on date,
  administration_route text,
  administration_site text,
  administered_at timestamptz not null,
  next_due_on date,
  reaction text,
  created_at timestamptz not null default now()
);

create table if not exists public.pvo_certificates (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.pvo_encounters(id) on delete restrict,
  storage_path text not null,
  practitioner_name text not null,
  practitioner_license text,
  issued_at timestamptz not null default now()
);

create table if not exists public.pvo_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- Lock all client roles out by default. Staff uses RLS-guarded reads/writes.
do $$
declare rel text;
begin
  foreach rel in array array[
    'pvo_staff','pvo_owners','pvo_pets','pvo_public_forms',
    'pvo_intake_submissions','pvo_consents','pvo_appointments',
    'pvo_encounters','pvo_vaccinations','pvo_certificates','pvo_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security',rel);
    execute format('revoke all on table public.%I from anon, authenticated',rel);
  end loop;
end $$;

grant select on public.pvo_staff to authenticated;
create policy "Staff may read their own profile"
  on public.pvo_staff for select to authenticated
  using (user_id = (select auth.uid()));

-- All business data is restricted to authorized staff in this single-office MVP.
-- Multi-tenant deployment requires replacing this with organization-scoped RLS.
do $$
declare rel text;
begin
  foreach rel in array array[
    'pvo_owners','pvo_pets','pvo_public_forms',
    'pvo_intake_submissions','pvo_consents','pvo_appointments',
    'pvo_encounters','pvo_vaccinations','pvo_certificates','pvo_audit_events'
  ] loop
    execute format('grant select on table public.%I to authenticated',rel);
    execute format(
      'create policy "Active PetVax staff may read" on public.%I for select to authenticated using (exists (select 1 from public.pvo_staff s where s.user_id=(select auth.uid()) and s.active))',
      rel);
  end loop;
end $$;

-- Staff can create/update appointments, clinical records and owner/pet corrections.
do $$
declare rel text;
begin
  foreach rel in array array[
    'pvo_owners','pvo_pets','pvo_appointments','pvo_encounters','pvo_vaccinations'
  ] loop
    execute format('grant insert, update on table public.%I to authenticated',rel);
    execute format(
      'create policy "Active staff may write" on public.%I for all to authenticated using (exists (select 1 from public.pvo_staff s where s.user_id=(select auth.uid()) and s.active)) with check (exists (select 1 from public.pvo_staff s where s.user_id=(select auth.uid()) and s.active))', rel);
  end loop;
end $$;
-- No client-role DELETE grants, even for staff.
grant update(status, owner_id) on public.pvo_intake_submissions to authenticated;
create policy "Staff review submissions" on public.pvo_intake_submissions
  for update to authenticated
  using (exists (select 1 from public.pvo_staff s where s.user_id=(select auth.uid()) and s.active))
  with check (exists (select 1 from public.pvo_staff s where s.user_id=(select auth.uid()) and s.active));

-- Prevent silent rewriting of signed consent or the audit history.
create function public.pvo_immutable_row() returns trigger language plpgsql
set search_path = '' as $$
begin
  raise exception 'Signed records and audit events are immutable';
end $$;
create trigger pvo_consent_immutable before update or delete
  on public.pvo_consents for each row execute function public.pvo_immutable_row();
create trigger pvo_audit_immutable before update or delete
  on public.pvo_audit_events for each row execute function public.pvo_immutable_row();

-- Called ONLY by the secret-key server route. Runs transactionally.
-- A new email creates one owner + pets; returning addresses are queued for
-- staff verification rather than allowing strangers to overwrite owner records.
create function public.pvo_accept_intake(
  p_digest text, p_key uuid, p_payload jsonb, p_signed_name text
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_form public.pvo_public_forms%rowtype;
  v_owner uuid;
  v_submission uuid;
  v_existing public.pvo_intake_submissions%rowtype;
  v_status text;
  v_pet jsonb;
  v_email text;
begin
  if p_payload is null or jsonb_typeof(p_payload->'pets') <> 'array'
     or jsonb_array_length(p_payload->'pets') not between 1 and 6
     or length(btrim(p_signed_name)) < 2
  then raise exception 'Invalid intake submission'; end if;
  select * into v_form from public.pvo_public_forms
    where token_digest=p_digest and active
      and (expires_at is null or expires_at > now());
  if not found then raise exception 'Form link is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_form.id::text||p_key::text,0));
  select * into v_existing from public.pvo_intake_submissions
    where form_id=v_form.id and submission_key=p_key;
  if found then
    return jsonb_build_object('submissionId',v_existing.id,'status',v_existing.status);
  end if;
  v_email := lower(btrim(p_payload#>>'{owner,email}'));
  if v_email is null or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'
  then raise exception 'Valid email required'; end if;
  insert into public.pvo_owners(full_name,email,phone,address)
    values (p_payload#>>'{owner,fullName}',v_email,
            p_payload#>>'{owner,phone}',p_payload#>>'{owner,address}')
    on conflict (email) do nothing returning id into v_owner;
  if v_owner is null then
    v_status := 'needs_review';
  else
    v_status := 'accepted';
    for v_pet in select value from jsonb_array_elements(p_payload->'pets') loop
      insert into public.pvo_pets(owner_id,name,species,breed,sex,notes)
      values(v_owner,v_pet->>'name',v_pet->>'species',
             v_pet->>'breed',v_pet->>'sex',v_pet->>'notes');
    end loop;
  end if;
  insert into public.pvo_intake_submissions
    (form_id,submission_key,owner_id,contact_email,payload,status)
    values(v_form.id,p_key,v_owner,v_email,p_payload,v_status)
    returning id into v_submission;
  insert into public.pvo_consents
    (submission_id,owner_id,signed_name,consent_version,consent_text_snapshot,evidence_sha256)
    values (
      v_submission,v_owner,p_signed_name,v_form.consent_version,v_form.consent_text,
      encode(sha256(convert_to(
        v_submission::text||'|'||p_signed_name||'|'||
        v_form.consent_version||'|'||v_form.consent_text,'UTF8')), 'hex')
    );
  insert into public.pvo_audit_events(event_type,entity_type,entity_id,metadata)
    values('intake_submitted','intake_submission',v_submission,
           jsonb_build_object('status',v_status,'form_id',v_form.id));
  return jsonb_build_object('submissionId',v_submission,'status',v_status);
end $$;

revoke all on function public.pvo_accept_intake(text,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.pvo_accept_intake(text,uuid,jsonb,text) to service_role;
revoke all on function public.pvo_immutable_row() from public, anon, authenticated;
