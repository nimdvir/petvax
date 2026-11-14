-- PetVax Office core schema
-- All Office tables live in `public` with lowercase names. The pre-existing
-- uppercase practice tables ("OWNER", "PET", ...) are empty and left untouched.
-- Timestamps are stored as timestamptz (UTC). Display uses America/New_York.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('admin', 'vet', 'staff');
create type public.species as enum ('dog', 'cat', 'other');
create type public.pet_sex as enum ('male', 'female', 'unknown');
create type public.contact_method as enum ('email', 'phone', 'text');
create type public.review_status as enum ('ok', 'needs_review', 'merged');
create type public.appointment_status as enum ('requested', 'confirmed', 'completed', 'canceled');
create type public.form_kind as enum ('intake', 'consent', 'intake_consent');
create type public.form_version_status as enum ('draft', 'published', 'retired');
create type public.submission_status as enum ('received', 'processed', 'needs_review', 'error');
create type public.note_status as enum ('draft', 'final', 'amended');
create type public.vaccination_status as enum ('active', 'superseded', 'voided');
create type public.certificate_status as enum ('issued', 'voided');
create type public.record_source as enum ('petvax', 'jotform', 'staff');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.digits_only(v text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(v, ''), '\D', '', 'g'), '')
$$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  user_id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  role public.staff_role not null default 'staff',
  -- Professional credentials are entered by an admin and never inferred.
  credentials text,             -- e.g. "DVM"
  license_number text,          -- veterinary license number
  license_state text default 'NY',
  signature_path text,          -- private storage path of an uploaded signature image
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_profiles_updated before update on public.staff_profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Owners, pets, relationships
-- ---------------------------------------------------------------------------
create table public.owners (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null default '',
  email text,
  phone text,
  phone_secondary text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  preferred_contact public.contact_method,
  notes text,
  email_normalized text generated always as (nullif(lower(trim(email)), '')) stored,
  phone_digits text generated always as (private.digits_only(phone)) stored,
  review_status public.review_status not null default 'ok',
  possible_duplicate_of uuid[] not null default '{}',
  merged_into_id uuid references public.owners (id),
  source public.record_source not null default 'petvax',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owners_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint owners_not_merged_into_self check (merged_into_id is null or merged_into_id <> id)
);
create index owners_email_idx on public.owners (email_normalized);
create index owners_phone_idx on public.owners (phone_digits);
create index owners_name_idx on public.owners (lower(last_name), lower(first_name));
create index owners_review_idx on public.owners (review_status) where review_status <> 'ok';
create index owners_merged_into_idx on public.owners (merged_into_id);
create trigger owners_updated before update on public.owners
  for each row execute function private.set_updated_at();

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  species public.species not null,
  species_other text,
  breed text,
  color text,
  sex public.pet_sex not null default 'unknown',
  spayed_neutered boolean,
  date_of_birth date,
  estimated_age_years numeric(4, 1) check (estimated_age_years is null or estimated_age_years between 0 and 40),
  weight_lb numeric(6, 2) check (weight_lb is null or weight_lb > 0),
  microchip text,
  allergies text,
  prior_reactions text,
  medical_conditions text,
  medications text,
  diet text,
  vaccine_history_notes text,
  lifestyle jsonb not null default '{}'::jsonb,   -- boarding, grooming, travel, wildlife exposure
  photo_path text,
  deceased boolean not null default false,
  source public.record_source not null default 'petvax',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pets_dob_not_future check (date_of_birth is null or date_of_birth <= current_date + 1)
);
create index pets_name_idx on public.pets (lower(name));
create unique index pets_microchip_uidx on public.pets (microchip) where microchip is not null and microchip <> '';
create trigger pets_updated before update on public.pets
  for each row execute function private.set_updated_at();

create table public.pet_owners (
  pet_id uuid not null references public.pets (id) on delete restrict,
  owner_id uuid not null references public.owners (id) on delete restrict,
  relationship text not null default 'owner',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (pet_id, owner_id)
);
create index pet_owners_owner_idx on public.pet_owners (owner_id);
create unique index pet_owners_one_primary on public.pet_owners (pet_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Customizable forms (versioned)
-- ---------------------------------------------------------------------------
create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind public.form_kind not null,
  title text not null,
  description text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger form_templates_updated before update on public.form_templates
  for each row execute function private.set_updated_at();

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates (id) on delete restrict,
  version integer not null check (version > 0),
  status public.form_version_status not null default 'draft',
  schema jsonb not null,                      -- sections + fields (see src/lib/forms/schema.ts)
  consent_text text,                          -- exact consent language shown to the client
  consent_text_sha256 text generated always as (
    case when consent_text is null then null
         else encode(extensions.digest(consent_text, 'sha256'), 'hex') end) stored,
  change_note text,
  created_by uuid references auth.users (id),
  published_by uuid references auth.users (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
create unique index form_versions_one_published on public.form_versions (template_id) where status = 'published';

-- Published / retired versions are immutable (only published -> retired is allowed).
create or replace function private.protect_form_versions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Published form versions cannot be deleted';
    end if;
    return old;
  end if;
  if old.status = 'retired' then
    raise exception 'Retired form versions are immutable';
  end if;
  if old.status = 'published' then
    if new.status = 'retired'
       and new.schema = old.schema
       and new.consent_text is not distinct from old.consent_text
       and new.version = old.version then
      return new;
    end if;
    raise exception 'Published form versions are immutable; create a new version instead';
  end if;
  return new;
end $$;
create trigger form_versions_protect before update or delete on public.form_versions
  for each row execute function private.protect_form_versions();

-- Reusable public links. Only the SHA-256 of the token is stored.
create table public.form_links (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates (id) on delete restrict,
  token_hash text not null unique,
  label text not null,
  owner_id uuid references public.owners (id),       -- optional: personal link for one client
  appointment_id uuid,                                -- optional: link for one appointment (fk added below)
  expires_at timestamptz,
  revoked_at timestamptz,
  use_count integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index form_links_template_idx on public.form_links (template_id);
create index form_links_owner_idx on public.form_links (owner_id);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners (id) on delete restrict,
  status public.appointment_status not null default 'requested',
  starts_at timestamptz,
  ends_at timestamptz,
  assigned_staff_id uuid references public.staff_profiles (user_id),
  visit_address text,
  client_notes text,
  internal_notes text,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  client_confirmed_at timestamptz,
  reminder_sent_at timestamptz,
  follow_up_on date,
  source public.record_source not null default 'staff',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_order check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint appointments_confirmed_has_time check (status not in ('confirmed', 'completed') or (starts_at is not null and ends_at is not null)),
  -- Two confirmed/completed visits for the same clinician may not overlap.
  constraint appointments_no_overlap exclude using gist (
    assigned_staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed', 'completed') and assigned_staff_id is not null)
);
create index appointments_owner_idx on public.appointments (owner_id);
create index appointments_starts_idx on public.appointments (starts_at);
create index appointments_staff_idx on public.appointments (assigned_staff_id);
create trigger appointments_updated before update on public.appointments
  for each row execute function private.set_updated_at();

alter table public.form_links
  add constraint form_links_appointment_fk foreign key (appointment_id) references public.appointments (id);
create index form_links_appointment_idx on public.form_links (appointment_id);

create table public.appointment_pets (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete restrict,
  requested_vaccines text[] not null default '{}',
  primary key (appointment_id, pet_id)
);
create index appointment_pets_pet_idx on public.appointment_pets (pet_id);

-- ---------------------------------------------------------------------------
-- Intake submissions + signed consents
-- ---------------------------------------------------------------------------
create table public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  form_version_id uuid references public.form_versions (id),
  form_link_id uuid references public.form_links (id),
  status public.submission_status not null default 'received',
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  owner_id uuid references public.owners (id),
  pet_ids uuid[] not null default '{}',
  match_result jsonb,          -- how the owner/pets were matched and why
  processing_error text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  source public.record_source not null default 'petvax',
  external_id text,            -- e.g. Jotform submission id
  created_at timestamptz not null default now()
);
create unique index intake_submissions_external_uidx on public.intake_submissions (source, external_id) where external_id is not null;
create index intake_submissions_owner_idx on public.intake_submissions (owner_id);
create index intake_submissions_status_idx on public.intake_submissions (status, submitted_at desc);
create index intake_submissions_version_idx on public.intake_submissions (form_version_id);
create index intake_submissions_link_idx on public.intake_submissions (form_link_id);

create table public.signed_consents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.intake_submissions (id),
  form_version_id uuid references public.form_versions (id),
  owner_id uuid not null references public.owners (id),
  pet_id uuid not null references public.pets (id),
  consent_text text not null,
  consent_text_sha256 text not null,
  signer_name text not null check (length(trim(signer_name)) > 0),
  signer_relationship text not null,
  signature_path text,               -- private storage path (PNG)
  signature_sha256 text,
  signed_at timestamptz not null,
  ip_address inet,
  user_agent text,
  evidence jsonb not null default '{}'::jsonb,
  source public.record_source not null default 'petvax',
  external_id text,
  prev_hash text,
  record_hash text not null,
  created_at timestamptz not null default now()
);
create index signed_consents_pet_idx on public.signed_consents (pet_id, signed_at desc);
create index signed_consents_owner_idx on public.signed_consents (owner_id);
create index signed_consents_submission_idx on public.signed_consents (submission_id);
create index signed_consents_version_idx on public.signed_consents (form_version_id);
create unique index signed_consents_external_uidx on public.signed_consents (source, external_id, pet_id) where external_id is not null;

-- Hash chain: each consent's hash covers its content plus the previous consent's hash.
create or replace function private.chain_consent()
returns trigger language plpgsql set search_path = '' as $$
declare
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('signed_consents_chain'));
  select record_hash into last_hash from public.signed_consents order by created_at desc, id desc limit 1;
  new.created_at := clock_timestamp();
  new.prev_hash := last_hash;
  new.consent_text_sha256 := encode(extensions.digest(new.consent_text, 'sha256'), 'hex');
  new.record_hash := encode(extensions.digest(
    concat_ws('|', coalesce(new.prev_hash, ''), new.id::text, new.owner_id::text, new.pet_id::text,
              new.consent_text_sha256, new.signer_name, new.signer_relationship,
              coalesce(new.signature_sha256, ''), to_char(new.signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
    'sha256'), 'hex');
  return new;
end $$;
create trigger signed_consents_chain before insert on public.signed_consents
  for each row execute function private.chain_consent();

create or replace function private.block_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% records are immutable', tg_table_name;
end $$;
create trigger signed_consents_immutable before update or delete on public.signed_consents
  for each row execute function private.block_mutation();

-- ---------------------------------------------------------------------------
-- Encounters, SOAP notes, vaccinations
-- ---------------------------------------------------------------------------
create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete restrict,
  pet_id uuid not null references public.pets (id) on delete restrict,
  owner_id uuid not null references public.owners (id) on delete restrict,
  clinician_id uuid references public.staff_profiles (user_id),
  encounter_date date not null default (now() at time zone 'America/New_York')::date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (appointment_id, pet_id)
);
create index encounters_pet_idx on public.encounters (pet_id, encounter_date desc);
create index encounters_owner_idx on public.encounters (owner_id);
create index encounters_clinician_idx on public.encounters (clinician_id);

create table public.soap_notes (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null unique references public.encounters (id) on delete restrict,
  status public.note_status not null default 'draft',
  subjective text,
  -- Objective: brief pre-vaccination exam
  temperature numeric(4, 1),
  temperature_unit text check (temperature_unit in ('F', 'C')),
  heart_rate_bpm integer check (heart_rate_bpm is null or heart_rate_bpm between 10 and 400),
  respiratory_rate_bpm integer check (respiratory_rate_bpm is null or respiratory_rate_bpm between 2 and 200),
  weight numeric(6, 2) check (weight is null or weight > 0),
  weight_unit text check (weight_unit in ('lb', 'kg')),
  body_condition_score numeric(3, 1),
  body_condition_scale integer check (body_condition_scale in (5, 9)),
  general_appearance text,
  exam_findings text,
  objective_notes text,
  assessment text,
  fit_for_vaccination boolean,
  plan text,
  observed_reactions text,
  follow_up text,
  amendment_reason text,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  finalized_by uuid references auth.users (id),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint soap_bcs_in_scale check (
    body_condition_score is null or (body_condition_scale is not null and body_condition_score between 1 and body_condition_scale)),
  constraint soap_temp_unit check (temperature is null or temperature_unit is not null),
  constraint soap_weight_unit check (weight is null or weight_unit is not null)
);
create trigger soap_notes_updated before update on public.soap_notes
  for each row execute function private.set_updated_at();

create table public.soap_note_revisions (
  id bigint generated always as identity primary key,
  soap_note_id uuid not null references public.soap_notes (id) on delete restrict,
  revision integer not null,
  status public.note_status not null,
  snapshot jsonb not null,
  edited_by uuid,
  edited_at timestamptz not null default now(),
  unique (soap_note_id, revision)
);
create trigger soap_note_revisions_immutable before update or delete on public.soap_note_revisions
  for each row execute function private.block_mutation();

-- Every saved version of a note is kept; finalized notes can only change through an amendment.
create or replace function private.soap_note_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  next_rev integer;
begin
  if tg_op = 'UPDATE' then
    if old.status in ('final', 'amended') then
      if new.status <> 'amended' or coalesce(trim(new.amendment_reason), '') = ''
         or new.amendment_reason is not distinct from old.amendment_reason then
        raise exception 'Finalized SOAP notes can only be changed by an amendment with a new reason';
      end if;
    end if;
    if new.status = 'final' and old.status = 'draft' then
      new.finalized_at := now();
    end if;
  end if;
  if tg_op = 'INSERT' and new.status = 'final' then
    new.finalized_at := now();
  end if;
  return new;
end $$;
create trigger soap_notes_guard before insert or update on public.soap_notes
  for each row execute function private.soap_note_guard();

-- Runs as owner so clinicians can never write (or forge) revision rows directly.
create or replace function private.soap_note_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  next_rev integer;
begin
  select coalesce(max(revision), 0) + 1 into next_rev from public.soap_note_revisions where soap_note_id = new.id;
  insert into public.soap_note_revisions (soap_note_id, revision, status, snapshot, edited_by)
  values (new.id, next_rev, new.status, to_jsonb(new), coalesce(new.updated_by, new.created_by));
  return null;
end $$;
create trigger soap_notes_snapshot after insert or update on public.soap_notes
  for each row execute function private.soap_note_snapshot();
create trigger soap_notes_no_delete before delete on public.soap_notes
  for each row execute function private.block_mutation();

create table public.vaccine_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vaccine_type text not null,            -- e.g. Rabies, DHPP, FVRCP
  species public.species not null,
  manufacturer text,
  default_route text,
  default_site text,
  default_interval_months integer check (default_interval_months is null or default_interval_months between 1 and 60),
  is_rabies boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, species, manufacturer)
);

create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid references public.encounters (id) on delete restrict,
  pet_id uuid not null references public.pets (id) on delete restrict,
  owner_id uuid not null references public.owners (id) on delete restrict,
  product_id uuid references public.vaccine_products (id),
  vaccine_name text not null,
  vaccine_type text not null,
  is_rabies boolean not null default false,
  manufacturer text,
  lot_number text,
  serial_number text,
  lot_expiration date,
  administered_on date not null,
  route text,
  site text,
  administered_by uuid references public.staff_profiles (user_id),
  administered_by_name text,      -- for imported historical records given elsewhere
  administered_elsewhere boolean not null default false,
  duration_months integer check (duration_months is null or duration_months between 1 and 60),
  next_due_on date,
  rabies_tag_number text,
  adverse_reaction text,
  notes text,
  status public.vaccination_status not null default 'active',
  supersedes_id uuid references public.vaccinations (id),
  correction_reason text,
  source public.record_source not null default 'staff',
  external_id text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint vaccinations_due_after_given check (next_due_on is null or next_due_on > administered_on),
  constraint vaccinations_correction_reason check (supersedes_id is null or coalesce(trim(correction_reason), '') <> ''),
  constraint vaccinations_given_by check (administered_elsewhere or administered_by is not null or source <> 'staff')
);
create index vaccinations_pet_idx on public.vaccinations (pet_id, administered_on desc);
create index vaccinations_encounter_idx on public.vaccinations (encounter_id);
create index vaccinations_owner_idx on public.vaccinations (owner_id);
create index vaccinations_due_idx on public.vaccinations (next_due_on) where status = 'active';
create index vaccinations_supersedes_idx on public.vaccinations (supersedes_id);
create index vaccinations_product_idx on public.vaccinations (product_id);
create index vaccinations_staff_idx on public.vaccinations (administered_by);
create unique index vaccinations_external_uidx on public.vaccinations (source, external_id) where external_id is not null;

-- Clinical fields are immutable. Corrections insert a new row that supersedes the old one.
create or replace function private.vaccination_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Vaccination records cannot be deleted; void or correct them instead';
  end if;
  if (to_jsonb(new) - 'status' - 'correction_reason') <> (to_jsonb(old) - 'status' - 'correction_reason') then
    raise exception 'Vaccination details are immutable; record a correction instead';
  end if;
  if old.status <> 'active' then
    raise exception 'Only active vaccination records can change status';
  end if;
  if new.status = 'voided' and coalesce(trim(new.correction_reason), '') = '' then
    raise exception 'A reason is required to void a vaccination';
  end if;
  return new;
end $$;
create trigger vaccinations_guard before update or delete on public.vaccinations
  for each row execute function private.vaccination_guard();

create or replace function private.vaccination_supersede()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.supersedes_id is not null then
    update public.vaccinations set status = 'superseded'
    where id = new.supersedes_id and status = 'active';
    if not found then
      raise exception 'The vaccination being corrected must exist and be active';
    end if;
  end if;
  return null;
end $$;
create trigger vaccinations_supersede after insert on public.vaccinations
  for each row execute function private.vaccination_supersede();

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------
create sequence public.certificate_number_seq start 1001;

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_number text not null unique,
  verification_code text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  pet_id uuid not null references public.pets (id) on delete restrict,
  owner_id uuid not null references public.owners (id) on delete restrict,
  encounter_id uuid references public.encounters (id),
  issued_by uuid not null references public.staff_profiles (user_id),
  issued_at timestamptz not null default now(),
  status public.certificate_status not null default 'issued',
  voided_reason text,
  voided_at timestamptz,
  pdf_path text,
  pdf_sha256 text,
  snapshot jsonb not null,       -- exact data printed on the certificate
  created_at timestamptz not null default now()
);
create index certificates_pet_idx on public.certificates (pet_id, issued_at desc);
create index certificates_owner_idx on public.certificates (owner_id);
create index certificates_encounter_idx on public.certificates (encounter_id);
create index certificates_issuer_idx on public.certificates (issued_by);

create or replace function private.certificate_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Certificates cannot be deleted; void them instead';
  end if;
  -- pdf_path / pdf_sha256 may be set once after the PDF is stored; status may go issued -> voided.
  if (to_jsonb(new) - 'status' - 'voided_reason' - 'voided_at' - 'pdf_path' - 'pdf_sha256')
     <> (to_jsonb(old) - 'status' - 'voided_reason' - 'voided_at' - 'pdf_path' - 'pdf_sha256') then
    raise exception 'Certificate contents are immutable';
  end if;
  if old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256 then
    raise exception 'A stored certificate PDF cannot be replaced';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'Voided certificates cannot be reinstated';
  end if;
  if new.status = 'voided' and old.status = 'issued' then
    if coalesce(trim(new.voided_reason), '') = '' then
      raise exception 'A reason is required to void a certificate';
    end if;
    new.voided_at := now();
  end if;
  return new;
end $$;
create trigger certificates_guard before update or delete on public.certificates
  for each row execute function private.certificate_guard();

create table public.certificate_vaccinations (
  certificate_id uuid not null references public.certificates (id) on delete restrict,
  vaccination_id uuid not null references public.vaccinations (id) on delete restrict,
  primary key (certificate_id, vaccination_id)
);
create index certificate_vaccinations_vax_idx on public.certificate_vaccinations (vaccination_id);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid references public.certificates (id),
  owner_id uuid references public.owners (id),
  to_email text not null,
  subject text not null,
  provider text not null,
  provider_message_id text,
  status text not null check (status in ('sent', 'failed', 'not_configured')),
  error text,
  sent_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index email_deliveries_cert_idx on public.email_deliveries (certificate_id);
create index email_deliveries_owner_idx on public.email_deliveries (owner_id);

-- ---------------------------------------------------------------------------
-- Documents / attachments
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.owners (id),
  pet_id uuid references public.pets (id),
  submission_id uuid references public.intake_submissions (id),
  kind text not null,                 -- pet_photo, prior_record, jotform_attachment, ...
  bucket text not null,
  storage_path text not null,
  filename text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  source public.record_source not null default 'petvax',
  external_id text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index documents_owner_idx on public.documents (owner_id);
create index documents_pet_idx on public.documents (pet_id);
create index documents_submission_idx on public.documents (submission_id);
create unique index documents_external_uidx on public.documents (source, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- External ids, imports, settings, audit
-- ---------------------------------------------------------------------------
create table public.external_ids (
  source text not null,
  external_id text not null,
  entity_type text not null,
  entity_id uuid not null,
  imported_at timestamptz not null default now(),
  primary key (source, external_id, entity_type)
);
create index external_ids_entity_idx on public.external_ids (entity_type, entity_id);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  dry_run boolean not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  reconciliation jsonb not null default '{}'::jsonb,
  started_by text
);

create table public.app_settings (
  id boolean primary key default true check (id),
  business_name text not null default 'PetVax',
  tagline text default 'House-call pet vaccinations in New York City',
  phone text,
  email text,
  website text,
  address text,
  certificate_footer text,
  certificate_accent_color text not null default '#b91c1c' check (certificate_accent_color ~ '^#[0-9a-fA-F]{6}$'),
  default_visit_minutes integer not null default 45 check (default_visit_minutes between 10 and 240),
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated before update on public.app_settings
  for each row execute function private.set_updated_at();

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_role text,
  action text not null,
  table_name text,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text not null
);
create index audit_events_record_idx on public.audit_events (table_name, record_id);
create index audit_events_time_idx on public.audit_events (occurred_at desc);

create or replace function private.write_audit(p_action text, p_table text, p_record text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  last_hash text;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
  v_at timestamptz := clock_timestamp();
begin
  if v_actor is null then
    begin
      v_actor := nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid;
      v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', v_role);
    exception when others then null;
    end;
  end if;
  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  select hash into last_hash from public.audit_events order by id desc limit 1;
  insert into public.audit_events (occurred_at, actor_id, actor_role, action, table_name, record_id, details, prev_hash, hash)
  values (v_at, v_actor, v_role, p_action, p_table, p_record, coalesce(p_details, '{}'::jsonb), last_hash,
          encode(extensions.digest(concat_ws('|', coalesce(last_hash, ''), v_at::text, coalesce(v_actor::text, ''),
                 p_action, coalesce(p_table, ''), coalesce(p_record, ''), coalesce(p_details, '{}'::jsonb)::text), 'sha256'), 'hex'));
end $$;
revoke all on function private.write_audit(text, text, text, jsonb) from public, anon, authenticated;

create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
  v_details jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'user_id');
    v_details := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'UPDATE' then
    v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'user_id');
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_details
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_details is null then
      return null;
    end if;
    v_details := jsonb_build_object('changes', v_details);
  else
    v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'user_id', to_jsonb(new) ->> 'pet_id');
    v_details := jsonb_build_object('new', to_jsonb(new));
  end if;
  perform private.write_audit(lower(tg_op), tg_table_name, v_id, v_details);
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['staff_profiles', 'owners', 'pets', 'pet_owners', 'form_templates', 'form_versions',
    'form_links', 'appointments', 'appointment_pets', 'intake_submissions', 'signed_consents', 'encounters',
    'soap_notes', 'vaccinations', 'vaccine_products', 'certificates', 'certificate_vaccinations',
    'email_deliveries', 'documents', 'app_settings']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()',
                   t || '_audit', t);
  end loop;
end $$;

create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function private.block_mutation();

-- Verifies the audit hash chain; returns the first broken event id, or null if intact.
create or replace function private.verify_audit_chain()
returns bigint language plpgsql set search_path = '' as $$
declare
  r record;
  prev text := null;
  expected text;
begin
  for r in select * from public.audit_events order by id loop
    expected := encode(extensions.digest(concat_ws('|', coalesce(prev, ''), r.occurred_at::text, coalesce(r.actor_id::text, ''),
                r.action, coalesce(r.table_name, ''), coalesce(r.record_id, ''), r.details::text), 'sha256'), 'hex');
    if r.prev_hash is distinct from prev or r.hash <> expected then
      return r.id;
    end if;
    prev := r.hash;
  end loop;
  return null;
end $$;

-- Certificate numbers: PVX-<year>-<sequence>
create or replace function public.next_certificate_number()
returns text language sql set search_path = '' as $$
  select 'PVX-' || to_char(now() at time zone 'America/New_York', 'YYYY') || '-' || lpad(nextval('public.certificate_number_seq')::text, 6, '0')
$$;
