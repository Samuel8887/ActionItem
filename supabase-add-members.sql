-- Apply to an existing Together project. Safe to run again.
begin;

create or replace function public.tg_add_members(p_group_id uuid,p_emails text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_emails text[];
  v_added text[];
  v_task uuid;
begin
  if public.tg_current_email() is null then raise exception 'Sign in with a verified email first.'; end if;
  -- Serialize membership changes and task creation for this group.
  select owner_id into v_owner from public.tg_groups where id = p_group_id for update;
  if v_owner is distinct from auth.uid() then raise exception 'Only the group administrator can add members.'; end if;
  if coalesce(array_length(p_emails,1),0) > 100 then raise exception 'A group can have up to 100 members.'; end if;
  select array_agg(distinct lower(btrim(e))) into v_emails
    from unnest(coalesce(p_emails,array[]::text[])) e where e is not null and btrim(e) <> '';
  if coalesce(array_length(v_emails,1),0) = 0 then raise exception 'Enter at least one email address.'; end if;
  if exists (select 1 from unnest(v_emails) e where length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter valid email addresses for every member.';
  end if;
  if (select count(*) from (select email from public.tg_members where group_id=p_group_id union select unnest(v_emails)) roster) > 100 then
    raise exception 'A group can have up to 100 members.';
  end if;
  with added as (
    insert into public.tg_members(group_id,email) select p_group_id,e from unnest(v_emails) e
    on conflict do nothing returning email
  ) select array_agg(email) into v_added from added;
  -- Lock each task before inspecting completion, matching tg_set_done's lock.
  -- A concurrently completed task remains historical; active tasks gain members.
  if coalesce(array_length(v_added,1),0) > 0 then
    for v_task in select id from public.tg_tasks where group_id=p_group_id order by id for update loop
      if exists (select 1 from public.tg_tasks where id=v_task and completed_at is null) then
        insert into public.tg_participants(task_id,email) select v_task,e from unnest(v_added) e on conflict do nothing;
      end if;
    end loop;
  end if;
  return jsonb_build_object('added',coalesce(array_length(v_added,1),0));
end; $$;

create or replace function public.tg_create_task(p_group_id uuid,p_title text,p_details text default '',p_due_on date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform 1 from public.tg_groups where id=p_group_id for update;
  if not public.tg_is_member(p_group_id) then raise exception 'You are not a member of this group.'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then raise exception 'Title must be 1–120 characters.'; end if;
  if length(coalesce(p_details,'')) > 2000 then raise exception 'Details must be at most 2000 characters.'; end if;
  insert into public.tg_tasks(group_id,title,details,due_on,created_by)
    values (p_group_id,btrim(p_title),coalesce(p_details,''),p_due_on,auth.uid()) returning id into v_id;
  insert into public.tg_participants(task_id,email)
    select v_id,email from public.tg_members where group_id = p_group_id;
  return v_id;
end; $$;

revoke all on function public.tg_add_members(uuid,text[]) from public,anon;
grant execute on function public.tg_add_members(uuid,text[]) to authenticated;
commit;
