-- Run ONCE in a new Supabase project's SQL Editor. The transaction is atomic.
begin;

create table public.tg_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.tg_members (
  group_id uuid not null references public.tg_groups(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  primary key (group_id,email)
);
create index tg_members_email_idx on public.tg_members(email,group_id);
create table public.tg_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tg_groups(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  details text not null default '' check (length(details) <= 2000),
  due_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tg_tasks_group_idx on public.tg_tasks(group_id,created_at desc);
create table public.tg_participants (
  task_id uuid not null references public.tg_tasks(id) on delete cascade,
  email text not null,
  done_at timestamptz,
  primary key (task_id,email)
);

-- Authoritative verified email; never trust an email passed by the browser.
create function public.tg_current_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
create function public.tg_is_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tg_members m
    where m.group_id = p_group_id and m.email = public.tg_current_email())
$$;

alter table public.tg_groups enable row level security;
alter table public.tg_members enable row level security;
alter table public.tg_tasks enable row level security;
alter table public.tg_participants enable row level security;
create policy tg_groups_read on public.tg_groups for select to authenticated using (public.tg_is_member(id));
create policy tg_members_read on public.tg_members for select to authenticated using (public.tg_is_member(group_id));
create policy tg_tasks_read on public.tg_tasks for select to authenticated using (public.tg_is_member(group_id));
create policy tg_participants_read on public.tg_participants for select to authenticated using (
  exists (select 1 from public.tg_tasks t where t.id = task_id and public.tg_is_member(t.group_id))
);

create function public.tg_create_group(p_name text,p_emails text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_email text := public.tg_current_email();
  v_emails text[];
begin
  if v_email is null then raise exception 'Sign in with a verified email first.'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Group name must be 1–80 characters.'; end if;
  if coalesce(array_length(p_emails,1),0) > 100 then raise exception 'A group can have up to 100 members.'; end if;
  select array_agg(distinct lower(btrim(e))) into v_emails
    from unnest(coalesce(p_emails,array[]::text[]) || array[v_email]) e
    where e is not null and btrim(e) <> '';
  if array_length(v_emails,1) > 100 then raise exception 'A group can have up to 100 members.'; end if;
  if exists (select 1 from unnest(v_emails) e where length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter valid email addresses for every member.';
  end if;
  insert into public.tg_groups(name,owner_id) values (btrim(p_name),auth.uid()) returning id into v_id;
  insert into public.tg_members(group_id,email) select v_id,e from unnest(v_emails) e;
  return v_id;
end; $$;

create function public.tg_create_task(p_group_id uuid,p_title text,p_details text default '',p_due_on date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.tg_is_member(p_group_id) then raise exception 'You are not a member of this group.'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then raise exception 'Title must be 1–120 characters.'; end if;
  if length(coalesce(p_details,'')) > 2000 then raise exception 'Details must be at most 2000 characters.'; end if;
  insert into public.tg_tasks(group_id,title,details,due_on,created_by)
    values (p_group_id,btrim(p_title),coalesce(p_details,''),p_due_on,auth.uid()) returning id into v_id;
  -- Snapshot everybody, including people who have not registered yet.
  insert into public.tg_participants(task_id,email)
    select v_id,email from public.tg_members where group_id = p_group_id;
  return v_id;
end; $$;

create function public.tg_set_done(p_task_id uuid,p_done boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
  v_email text := public.tg_current_email();
  v_total integer;
  v_done integer;
  v_complete boolean;
begin
  if v_email is null then raise exception 'Sign in with a verified email first.'; end if;
  if p_done is null then raise exception 'Completion must be true or false.'; end if;
  -- Every completion on the same task takes this lock, preventing races.
  select group_id into v_group from public.tg_tasks where id = p_task_id for update;
  if v_group is null or not public.tg_is_member(v_group) then raise exception 'Action item unavailable.'; end if;
  update public.tg_participants
    set done_at = case when p_done then coalesce(done_at,now()) else null end
    where task_id = p_task_id and email = v_email;
  if not found then raise exception 'You are not assigned to this action item.'; end if;
  select count(*),count(done_at) into v_total,v_done from public.tg_participants where task_id = p_task_id;
  v_complete := v_total > 0 and v_total = v_done;
  update public.tg_tasks set completed_at = case when v_complete then coalesce(completed_at,now()) else null end where id = p_task_id;
  return jsonb_build_object('completed',v_complete,'done',v_done,'total',v_total);
end; $$;

-- Read-only tables for browser users. All writes go through checked functions.
revoke all on public.tg_groups,public.tg_members,public.tg_tasks,public.tg_participants from anon,authenticated;
grant select on public.tg_groups,public.tg_members,public.tg_tasks,public.tg_participants to authenticated;
revoke all on function public.tg_current_email() from public,anon;
revoke all on function public.tg_is_member(uuid) from public,anon;
revoke all on function public.tg_create_group(text,text[]) from public,anon;
revoke all on function public.tg_create_task(uuid,text,text,date) from public,anon;
revoke all on function public.tg_set_done(uuid,boolean) from public,anon;
grant execute on function public.tg_current_email(),public.tg_is_member(uuid),public.tg_create_group(text,text[]),public.tg_create_task(uuid,text,text,date),public.tg_set_done(uuid,boolean) to authenticated;
commit;
