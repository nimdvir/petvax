-- Supervising veterinarian printed on certificates (PetVax's rabies certificates list the
-- licensed veterinarian alongside the technician who gives the vaccine). Entered by an
-- admin; never filled in automatically.
alter table public.app_settings
  add column supervising_vet_name text,
  add column supervising_vet_license text,
  add column supervising_vet_license_state text default 'NY';
