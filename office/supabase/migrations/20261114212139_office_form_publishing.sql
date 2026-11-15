-- General (non-personal) links are meant to be shared publicly (website, texts), so staff
-- need to copy them again later: keep the token for those. Personal links (tied to one
-- client or appointment) store only the hash.
alter table public.form_links add column share_token text;
alter table public.form_links add constraint form_links_share_token_general_only
  check (share_token is null or (owner_id is null and appointment_id is null));

-- Publish a draft version atomically: retire the current published version, publish the draft.
create or replace function public.publish_form_version(p_version_id uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_template uuid;
begin
  select template_id into v_template from public.form_versions where id = p_version_id and status = 'draft' for update;
  if v_template is null then
    raise exception 'Only a draft version can be published';
  end if;
  update public.form_versions set status = 'retired' where template_id = v_template and status = 'published';
  update public.form_versions
     set status = 'published', published_at = now(), published_by = (select auth.uid())
   where id = p_version_id;
end $$;
revoke all on function public.publish_form_version(uuid) from public, anon;
grant execute on function public.publish_form_version(uuid) to authenticated, service_role;
