-- pgTAP security invariants (requires local Supabase test stack).
begin;
select plan(14);
select ok((select relrowsecurity from pg_class where oid='public.pvo_staff'::regclass),'Staff RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_owners'::regclass),'Owner RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_pets'::regclass),'Pet RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_public_forms'::regclass),'Public form RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_intake_submissions'::regclass),'Intake RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_consents'::regclass),'Consent RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_appointments'::regclass),'Appointment RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_encounters'::regclass),'Encounter RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_vaccinations'::regclass),'Vaccine RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_certificates'::regclass),'Certificate RLS on');
select ok((select relrowsecurity from pg_class where oid='public.pvo_audit_events'::regclass),'Audit RLS on');
select ok(not has_table_privilege('anon','public.pvo_owners','select'),'Visitors cannot read owner records');
select ok(not has_table_privilege('anon','public.pvo_consents','select'),'Visitors cannot read consent records');
select ok(not has_function_privilege('anon','public.pvo_accept_intake(text,uuid,jsonb,text)','execute'),'Visitors cannot call intake DB function');
select * from finish();
rollback;
