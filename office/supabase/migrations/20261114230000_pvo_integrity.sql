-- Invariant enforcement for database writes from RLS-authorized staff.
-- This migration must be reviewed against the actual existing schema before deployment.
create function public.pvo_check_pet_relationship() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  if tg_table_name = 'pvo_appointments' then
    if new.pet_id is not null then
      select owner_id into v_owner from public.pvo_pets where id=new.pet_id;
      if v_owner is distinct from new.owner_id then
        raise exception 'Appointment pet does not belong to selected owner';
      end if;
    end if;
  elsif tg_table_name = 'pvo_vaccinations' then
    if not exists(
      select 1 from public.pvo_encounters e
      where e.id=new.encounter_id and e.pet_id=new.pet_id
    ) then raise exception 'Vaccine encounter/pet mismatch'; end if;
  end if;
  return new;
end $$;

create trigger pvo_appt_owner_match before insert or update
  on public.pvo_appointments for each row
  execute function public.pvo_check_pet_relationship();
create trigger pvo_vaccine_pet_match before insert or update
  on public.pvo_vaccinations for each row
  execute function public.pvo_check_pet_relationship();

-- Finalized clinical records cannot be silently rewritten.
-- Finalization is intentionally blocked until professional credential validation,
-- immutable revision workflow and signed certificate requirements are built.
create function public.pvo_protect_clinical_record() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'pvo_encounters' then
    if tg_op = 'DELETE' or old.finalized_at is not null then
      raise exception 'Finalized encounter cannot be modified';
    end if;
    if new.finalized_at is not null then
      raise exception 'Clinical finalization is not enabled yet';
    end if;
  elsif tg_table_name = 'pvo_vaccinations' then
    if tg_op = 'DELETE' or exists(
      select 1 from public.pvo_encounters e
      where e.id=old.encounter_id and e.finalized_at is not null
    ) then raise exception 'Finalized vaccine record cannot be modified'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger pvo_encounter_guard before update or delete
  on public.pvo_encounters for each row
  execute function public.pvo_protect_clinical_record();
create trigger pvo_vaccine_guard before update or delete
  on public.pvo_vaccinations for each row
  execute function public.pvo_protect_clinical_record();
revoke all on function public.pvo_check_pet_relationship() from public, anon, authenticated;
revoke all on function public.pvo_protect_clinical_record() from public, anon, authenticated;
