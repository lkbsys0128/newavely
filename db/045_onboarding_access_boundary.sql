-- Apply after 044. Existing role/scope policies remain in effect (AND restrictions).
create or replace function public.is_registered_member()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and coalesce(current_member_status() in ('active', 'care'), false); $$;
revoke all on function public.is_registered_member() from public;
grant execute on function public.is_registered_member() to authenticated;

create or replace function public.current_member_role()
returns member_role language sql stable security definer set search_path = public
as $$ select role from members where auth_user_id = auth.uid() and status in ('active', 'care'); $$;

drop policy if exists "registration select boundary" on public.members;
create policy "registration select boundary" on public.members as restrictive for select to authenticated
using (is_registered_member() or auth_user_id = auth.uid());
drop policy if exists "registration update boundary" on public.members;
create policy "registration update boundary" on public.members as restrictive for update to authenticated
using (is_registered_member()) with check (is_registered_member());
drop policy if exists "registration delete boundary" on public.members;
create policy "registration delete boundary" on public.members as restrictive for delete to authenticated
using (is_registered_member());
drop policy if exists "registration insert boundary" on public.members;
create policy "registration insert boundary" on public.members as restrictive for insert to authenticated
with check (is_registered_member() or (auth_user_id = auth.uid() and role = 'member' and status = 'new' and group_id is null));

drop policy if exists "registration request boundary" on public.member_link_requests;
create policy "registration request boundary" on public.member_link_requests as restrictive for insert to authenticated
with check (is_registered_member() or (requester_member_id = current_member_id() and current_member_status() = 'new'
  and target_member_id is null and status = 'pending' and resolved_at is null));

do $$ declare target text; begin
  foreach target in array array['groups', 'attendance_events', 'attendance_records', 'attendance_extra_counts',
    'calendar_events', 'member_custom_field_definitions', 'care_followups', 'member_status_messages',
    'admin_feedback_messages', 'new_family_applicants', 'important_links', 'audit_logs'] loop
    if to_regclass('public.' || target) is not null then
      execute format('drop policy if exists "registration boundary" on public.%I', target);
      execute format('create policy "registration boundary" on public.%I as restrictive for all to authenticated using (public.is_registered_member()) with check (public.is_registered_member())', target);
    end if;
  end loop;
end $$;
create or replace function get_public_dashboard_groups()
returns table (
  id uuid,
  name text,
  leader_member_id uuid,
  leader_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.leader_member_id,
    coalesce(l.name, '미배정') as leader_name
  from groups g
  left join members l on l.id = g.leader_member_id
  where public.is_registered_member()
  order by g.name;
$$;

create or replace function get_public_dashboard_members()
returns table (
  id uuid,
  name text,
  group_id uuid,
  group_name text,
  status member_status,
  custom_fields jsonb,
  is_merged_placeholder boolean,
  attendance_records jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.name,
    m.group_id,
    coalesce(g.name, '미배정') as group_name,
    m.status,
    jsonb_strip_nulls(
      jsonb_build_object(
        'english_name', m.custom_fields -> 'english_name',
        'gender', m.custom_fields -> 'gender',
        'birthdate', m.custom_fields -> 'birthdate',
        'age', m.custom_fields -> 'age',
        'job', m.custom_fields -> 'job',
        'test_account', m.custom_fields -> 'test_account',
        'community_leader_role', m.custom_fields -> 'community_leader_role',
        'ministries', m.custom_fields -> 'ministries',
        'ministry_1', m.custom_fields -> 'ministry_1',
        'ministry_2', m.custom_fields -> 'ministry_2'
      )
    ) as custom_fields,
    coalesce(m.email, '') ilike '%@merged.local' as is_merged_placeholder,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'event_id', ar.event_id,
          'status', ar.status
        )
      ) filter (where ar.id is not null),
      '[]'::jsonb
    ) as attendance_records
  from members m
  left join groups g on g.id = m.group_id
  left join attendance_records ar on ar.member_id = m.id
  where public.is_registered_member()
  group by m.id, g.name
  order by m.name;
$$;

create or replace function get_public_permission_role_counts()
returns table (
  role member_role,
  member_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.role,
    count(*) as member_count
  from members m
  where public.is_registered_member() and m.status <> 'inactive'
    and coalesce(m.email, '') not ilike '%@merged.local'
    and coalesce((m.custom_fields ->> 'test_account')::boolean, false) = false
  group by m.role
  order by m.role;
$$;

revoke all on function get_public_dashboard_groups() from public;
revoke all on function get_public_dashboard_members() from public;
revoke all on function get_public_permission_role_counts() from public;
grant execute on function get_public_dashboard_groups() to authenticated;
grant execute on function get_public_dashboard_members() to authenticated;
grant execute on function get_public_permission_role_counts() to authenticated;
create or replace function record_audit_log(
  p_action text,
  p_target_table text,
  p_target_id uuid,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  actor_id uuid;
begin
  select id into actor_id
  from members
  where auth_user_id = auth.uid()
  limit 1;

  if auth.uid() is null or actor_id is null then
    raise exception 'Login required';
  end if;
  if not public.is_registered_member() and not (
    p_action = 'member_link_request.create' and p_target_table = 'member_link_requests'
    and exists (select 1 from member_link_requests where id = p_target_id
      and requester_member_id = actor_id and status = 'pending' and target_member_id is null)
  ) then raise exception 'Registration approval required'; end if;

  insert into audit_logs (
    actor_member_id,
    actor_auth_user_id,
    action,
    target_table,
    target_id,
    before_data,
    after_data,
    metadata
  )
  values (
    actor_id,
    auth.uid(),
    p_action,
    p_target_table,
    p_target_id,
    p_before_data,
    p_after_data,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

grant execute on function record_audit_log(text, text, uuid, jsonb, jsonb, jsonb) to authenticated;


revoke all on function record_audit_log(text, text, uuid, jsonb, jsonb, jsonb) from public;

