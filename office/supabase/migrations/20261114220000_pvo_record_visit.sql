-- Additive clinical visit transaction. Not applied to any hosted database.
alter table public.pvo_encounters
  add column if not exists record_key uuid unique;
create unique index if not exists pvo_encounters_record_key_idx
  on public.pvo_encounters(record_key) where record_key is not null;

create function public.pvo_record_visit(
  p_record_key uuid, p_appointment_id uuid, p_pet_id uuid,
  p_clinician_id uuid, p_exam jsonb, p_vaccines jsonb
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_appt_pet uuid;
  v_vaccine jsonb;
  v_count int;
begin
  if jsonb_typeof(p_vaccines) <> 'array' then
    raise exception 'Vaccines must be an array';
  end if;
  v_count:=jsonb_array_length(p_vaccines);
  if v_count < 1 or v_count > 8 then
    raise exception 'A clinical visit must contain 1-8 vaccines';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_record_key::text,0));
  select id into v_id from public.pvo_encounters where record_key=p_record_key;
  if v_id is not null then return jsonb_build_object('encounterId',v_id,'replayed',true); end if;
  select pet_id into v_appt_pet from public.pvo_appointments
    where id=p_appointment_id and status <> 'canceled' for update;
  if v_appt_pet is null or v_appt_pet <> p_pet_id then
    raise exception 'Appointment and pet mismatch';
  end if;
  if not exists(select 1 from public.pvo_staff where user_id=p_clinician_id and active) then
    raise exception 'Clinician account not authorized';
  end if;
  insert into public.pvo_encounters(
    record_key,appointment_id,pet_id,clinician_id,
    temp_c,heart_rate_bpm,respiratory_rate_bpm,weight_kg,
    bcs_score,bcs_scale,subjective,objective,assessment,plan,reactions
  ) values(
    p_record_key,p_appointment_id,p_pet_id,p_clinician_id,
    nullif(p_exam->>'tempC','')::numeric,
    nullif(p_exam->>'heartRate','')::int,
    nullif(p_exam->>'respRate','')::int,
    nullif(p_exam->>'weightKg','')::numeric,
    nullif(p_exam->>'bcsScore','')::int,
    case when nullif(p_exam->>'bcsScore','') is null then null else '1-9' end,
    p_exam->>'subjective',p_exam->>'objective',
    p_exam->>'assessment',p_exam->>'plan',p_exam->>'reactions'
  ) returning id into v_id;
  for v_vaccine in select value from jsonb_array_elements(p_vaccines) loop
    if nullif(v_vaccine->>'name','') is null or
       nullif(v_vaccine->>'lotNumber','') is null then
      raise exception 'Vaccine name and lot number required';
    end if;
    insert into public.pvo_vaccinations(
      encounter_id,pet_id,vaccine_name,manufacturer,lot_number,
      product_expires_on,administration_route,administration_site,
      administered_at,next_due_on,reaction
    ) values(
      v_id,p_pet_id,v_vaccine->>'name',v_vaccine->>'manufacturer',
      v_vaccine->>'lotNumber',nullif(v_vaccine->>'expiresOn','')::date,
      v_vaccine->>'route',v_vaccine->>'site',
      now(),nullif(v_vaccine->>'nextDueOn','')::date,
      v_vaccine->>'reaction'
    );
  end loop;
  insert into public.pvo_audit_events(
    event_type,entity_type,entity_id,actor_user_id,metadata
  ) values(
    'clinical_draft_created','encounter',v_id,p_clinician_id,
    jsonb_build_object('appointmentId',p_appointment_id,'vaccineCount',v_count)
  );
  return jsonb_build_object('encounterId',v_id,'replayed',false);
end $$;
revoke all on function public.pvo_record_visit(uuid,uuid,uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.pvo_record_visit(uuid,uuid,uuid,uuid,jsonb,jsonb)
  to service_role;
