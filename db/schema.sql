create type member_role as enum ('owner', 'admin', 'leader', 'staff', 'assistant', 'welcome', 'member');
create type member_status as enum ('active', 'new', 'care', 'inactive');
create type attendance_status as enum ('present', 'absent', 'excused');
create type care_followup_status as enum ('needed', 'contacted', 'prayer', 'resolved');

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader_member_id uuid,
  target_size integer not null default 12,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  group_id uuid references groups(id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  address text,
  baptism_status text,
  role member_role not null default 'member',
  status member_status not null default 'active',
  custom_fields jsonb not null default '{}',
  care_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table deleted_auth_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  deleted_member_id uuid,
  deleted_member_name text,
  deleted_member_email text,
  deleted_by_member_id uuid references members(id) on delete set null,
  reason text not null default 'member.permanent_delete',
  restore_requested_at timestamptz,
  restore_request_note text,
  created_at timestamptz not null default now()
);

alter table groups
  add constraint groups_leader_member_id_fkey
  foreign key (leader_member_id) references members(id) on delete set null;

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null default '주일 예배',
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  description text,
  event_type text not null default 'event' check (event_type in ('event', 'meeting', 'notice')),
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references attendance_events(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  status attendance_status not null default 'absent',
  note text,
  excuse_start_date date,
  excuse_end_date date,
  checked_by_member_id uuid references members(id) on delete set null,
  checked_at timestamptz,
  unique (event_id, member_id)
);

create table attendance_extra_counts (
  event_date date primary key,
  clergy_count integer not null default 0 check (clergy_count >= 0),
  team_leader_count integer not null default 0 check (team_leader_count >= 0),
  visitor_count integer not null default 0 check (visitor_count >= 0),
  new_family_count integer not null default 0 check (new_family_count >= 0),
  note text,
  updated_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table member_custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  field_type text not null default 'text',
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create table care_followups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  assigned_to_member_id uuid references members(id) on delete set null,
  status care_followup_status not null default 'needed',
  note text not null,
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table member_link_requests (
  id uuid primary key default gen_random_uuid(),
  requester_member_id uuid not null references members(id) on delete cascade,
  target_member_id uuid references members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_member_id uuid references members(id) on delete set null,
  constraint member_link_requests_distinct_members check (target_member_id is null or requester_member_id <> target_member_id)
);

create table important_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  url text not null unique,
  icon_key text not null default 'default' check (icon_key in ('website', 'links', 'youtube', 'instagram', 'default')),
  display_order integer not null default 100,
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table member_status_messages (
  member_id uuid primary key references members(id) on delete cascade,
  message text not null check (char_length(message) <= 80),
  updated_at timestamptz not null default now()
);

create table admin_feedback_messages (
  id uuid primary key default gen_random_uuid(),
  reporter_member_id uuid not null references members(id) on delete cascade,
  category text not null default 'other' check (category in ('feature', 'bug', 'question', 'other')),
  title text not null check (char_length(title) <= 80),
  message text not null check (char_length(message) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  admin_note text,
  resolved_by_member_id uuid references members(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table new_family_applicants (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_row_number integer not null,
  submitted_at timestamptz,
  name text not null,
  email text,
  phone text,
  group_interest text,
  expected_group text,
  memo text,
  status text not null default 'new' check (status in ('new', 'contacted', 'week_1', 'week_2', 'week_3', 'completed', 'archived')),
  source_data jsonb not null default '{}'::jsonb,
  converted_member_id uuid references members(id) on delete set null,
  converted_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index members_group_idx on members(group_id);
create index members_role_idx on members(role);
create index members_auth_user_idx on members(auth_user_id);
create index deleted_auth_users_created_at_idx on deleted_auth_users(created_at desc);
create index deleted_auth_users_deleted_member_id_idx on deleted_auth_users(deleted_member_id);
create index attendance_records_event_idx on attendance_records(event_id);
create index attendance_records_member_idx on attendance_records(member_id);
create index calendar_events_event_date_idx on calendar_events(event_date, created_at);
create index attendance_extra_counts_updated_at_idx on attendance_extra_counts(updated_at desc);
create index care_followups_member_idx on care_followups(member_id);
create index care_followups_status_idx on care_followups(status);
create unique index member_link_requests_one_pending_per_requester_idx
on member_link_requests(requester_member_id)
where status = 'pending';
create index member_link_requests_target_idx on member_link_requests(target_member_id);
create index member_link_requests_status_idx on member_link_requests(status);
create index important_links_display_order_idx on important_links(display_order, created_at);
create index member_status_messages_updated_at_idx on member_status_messages(updated_at desc);
create index admin_feedback_messages_status_idx on admin_feedback_messages(status, created_at desc);
create index admin_feedback_messages_reporter_idx on admin_feedback_messages(reporter_member_id, created_at desc);
create index new_family_applicants_status_idx on new_family_applicants(status);
create index new_family_applicants_submitted_at_idx on new_family_applicants(submitted_at desc nulls last);

alter table groups enable row level security;
alter table members enable row level security;
alter table deleted_auth_users enable row level security;
alter table attendance_events enable row level security;
alter table calendar_events enable row level security;
alter table attendance_records enable row level security;
alter table attendance_extra_counts enable row level security;
alter table member_custom_field_definitions enable row level security;
alter table care_followups enable row level security;
alter table member_link_requests enable row level security;
alter table important_links enable row level security;
alter table member_status_messages enable row level security;
alter table admin_feedback_messages enable row level security;
alter table new_family_applicants enable row level security;

create or replace function current_member_role()
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from members where auth_user_id = auth.uid()),
    'member'::member_role
  );
$$;

create or replace function current_member_status()
returns member_status
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select status from members where auth_user_id = auth.uid()),
    'new'::member_status
  );
$$;

create or replace function current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from members
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function current_member_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select group_id
  from members
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function can_manage_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('owner', 'admin', 'leader', 'staff');
$$;

create or replace function can_read_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('owner', 'admin', 'leader', 'staff', 'assistant');
$$;

create or replace function can_manage_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('owner', 'admin', 'leader', 'staff', 'assistant');
$$;

create or replace function can_manage_attendance_events()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('owner', 'admin', 'leader', 'staff');
$$;

create policy "authenticated users can read groups"
on groups for select
to authenticated
using (true);

create policy "owners and admins can write groups"
on groups for all
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));

create policy "authenticated users can read allowed members"
on members for select
to authenticated
using (
  can_read_members()
  or auth_user_id = auth.uid()
  or (
    current_member_status() = 'new'
    and status <> 'inactive'
    and auth_user_id is null
  )
);

create policy "users can create their own pending member profile"
on members for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and role = 'member'
  and status = 'new'
);

create policy "admins and leaders can insert members"
on members for insert
to authenticated
with check (
  current_member_role() = 'owner'
  or (current_member_role() = 'admin' and role <> 'owner')
  or (current_member_role() = 'leader' and role in ('member', 'assistant'))
  or (current_member_role() = 'staff' and role in ('member', 'assistant'))
);

create policy "admins and leaders can update members"
on members for update
to authenticated
using (can_manage_members())
with check (
  current_member_role() = 'owner'
  or (current_member_role() = 'admin' and role <> 'owner')
  or (current_member_role() = 'leader' and role in ('member', 'assistant'))
  or (current_member_role() = 'staff' and role in ('member', 'assistant'))
);

create policy "users can update their own member profile"
on members for update
to authenticated
using (
  auth_user_id = auth.uid()
  and role = 'member'::member_role
)
with check (
  auth_user_id = auth.uid()
  and role = 'member'::member_role
  and status <> 'inactive'::member_status
  and group_id is not distinct from current_member_group_id()
);

create policy "authorized users can delete lower role members"
on members for delete
to authenticated
using (
  current_member_role() in ('owner', 'admin', 'leader', 'staff', 'assistant', 'welcome')
  and
  case current_member_role()
    when 'owner' then 5
    when 'admin' then 4
    when 'leader' then 3
    when 'staff' then 3
    when 'member' then 1
    else 0
  end >
  case role
    when 'owner' then 5
    when 'admin' then 4
    when 'leader' then 3
    when 'staff' then 3
    when 'member' then 1
    else 0
  end
);

create policy "deleted auth users can read own block"
on deleted_auth_users for select
to authenticated
using (auth_user_id = auth.uid() or current_member_role() in ('owner', 'admin'));

create policy "authorized users can create deleted auth blocks"
on deleted_auth_users for insert
to authenticated
with check (current_member_role() in ('owner', 'admin', 'leader', 'staff'));

create policy "owners and admins can remove deleted auth blocks"
on deleted_auth_users for delete
to authenticated
using (current_member_role() in ('owner', 'admin'));

create policy "deleted auth users can request restore"
on deleted_auth_users for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

create policy "leaders can delete groups"
on groups for delete
to authenticated
using (current_member_role() in ('owner', 'admin', 'leader', 'staff'));

create policy "authenticated users can read attendance events"
on attendance_events for select
to authenticated
using (true);

create policy "admins and leaders can manage attendance events"
on attendance_events for all
to authenticated
using (can_manage_attendance_events())
with check (can_manage_attendance_events());

create policy "authenticated users can read calendar events"
on calendar_events for select
to authenticated
using (true);

create policy "owners and admins can insert calendar events"
on calendar_events for insert
to authenticated
with check (current_member_role() in ('owner', 'admin'));

create policy "owners and admins can update calendar events"
on calendar_events for update
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));

create policy "owners and admins can delete calendar events"
on calendar_events for delete
to authenticated
using (current_member_role() in ('owner', 'admin'));

create policy "authorized users can read attendance records"
on attendance_records for select
to authenticated
using (
  current_member_role() in ('owner', 'admin', 'leader', 'staff')
  or member_id in (select id from members where auth_user_id = auth.uid())
);

create policy "admins and leaders can manage attendance records"
on attendance_records for all
to authenticated
using (can_manage_attendance())
with check (can_manage_attendance());

create policy "owners admins and welcome can read attendance extra counts"
on attendance_extra_counts for select
to authenticated
using (current_member_role() in ('owner', 'admin', 'welcome'));

create policy "owners admins and welcome can manage attendance extra counts"
on attendance_extra_counts for all
to authenticated
using (current_member_role() in ('owner', 'admin', 'welcome'))
with check (current_member_role() in ('owner', 'admin', 'welcome'));

create policy "owners and admins can manage custom field definitions"
on member_custom_field_definitions for all
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));

create policy "admins and leaders can read custom field definitions"
on member_custom_field_definitions for select
to authenticated
using (current_member_role() in ('owner', 'admin', 'leader', 'staff'));

create policy "admins and leaders can read care followups"
on care_followups for select
to authenticated
using (can_manage_members());

create policy "admins and leaders can manage care followups"
on care_followups for all
to authenticated
using (can_manage_members())
with check (can_manage_members());

create policy "users can read their own link requests"
on member_link_requests for select
to authenticated
using (
  requester_member_id = current_member_id()
  or current_member_role() in ('owner', 'admin')
);

create policy "users can create their own link requests"
on member_link_requests for insert
to authenticated
with check (
  requester_member_id = current_member_id()
);

create policy "owners and admins can update link requests"
on member_link_requests for update
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));

create policy "authenticated users can read important links"
on important_links for select
to authenticated
using (true);

create policy "soonjang and above can create important links"
on important_links for insert
to authenticated
with check (current_member_role() in ('owner', 'admin', 'leader', 'staff'));

create policy "owners and admins can delete important links"
on important_links for delete
to authenticated
using (current_member_role() in ('owner', 'admin'));

create policy "authenticated users can read member status messages"
on member_status_messages for select
to authenticated
using (true);

create policy "users can create their own member status message"
on member_status_messages for insert
to authenticated
with check (member_id = current_member_id());

create policy "users can update their own member status message"
on member_status_messages for update
to authenticated
using (member_id = current_member_id())
with check (member_id = current_member_id());

create policy "users can delete their own member status message"
on member_status_messages for delete
to authenticated
using (member_id = current_member_id());

create policy "users can read own feedback messages"
on admin_feedback_messages for select
to authenticated
using (reporter_member_id = public.current_member_id() or public.current_member_role() in ('owner', 'admin'));

create policy "users can create own feedback messages"
on admin_feedback_messages for insert
to authenticated
with check (reporter_member_id = public.current_member_id());

create policy "owners and admins can update feedback messages"
on admin_feedback_messages for update
to authenticated
using (public.current_member_role() in ('owner', 'admin'))
with check (public.current_member_role() in ('owner', 'admin'));

create policy "owners and admins can read new family applicants"
on new_family_applicants for select
to authenticated
using (public.current_member_role() in ('owner', 'admin', 'welcome'));

create policy "owners and admins can create new family applicants"
on new_family_applicants for insert
to authenticated
with check (public.current_member_role() in ('owner', 'admin', 'welcome'));

create policy "owners and admins can update new family applicants"
on new_family_applicants for update
to authenticated
using (public.current_member_role() in ('owner', 'admin', 'welcome'))
with check (public.current_member_role() in ('owner', 'admin', 'welcome'));

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
  where m.status <> 'inactive'
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

create or replace function public.bulk_assign_group_members(
  source_group_id uuid, target_group_id uuid, selected_member_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  source_leader uuid;
  expected_count integer;
  changed_count integer;
  before_rows jsonb;
begin
  if current_member_role() not in ('owner', 'admin') or current_member_role() is null then
    raise exception '관리자만 순을 일괄 배정할 수 있습니다.';
  end if;
  expected_count := cardinality(selected_member_ids);
  if expected_count is null or expected_count < 1 or expected_count > 500
     or exists (select 1 from unnest(selected_member_ids) id where id is null)
     or expected_count <> (select count(distinct id) from unnest(selected_member_ids) id) then
    raise exception '이동할 멤버를 올바르게 선택해주세요.';
  end if;
  if source_group_id = target_group_id then
    raise exception '다른 순을 선택해주세요.';
  end if;
  -- Lock both groups in a stable order before validating and moving members.
  perform id from groups where id in (source_group_id, target_group_id) order by id for update;
  select leader_member_id into source_leader from groups where id = source_group_id;
  if not found then raise exception '원본 순을 찾을 수 없습니다.'; end if;
  if target_group_id is not null and not exists (select 1 from groups where id = target_group_id) then
    raise exception '대상 순을 찾을 수 없습니다.';
  end if;
  perform id from members where id = any(selected_member_ids) order by id for update;
  select jsonb_agg(jsonb_build_object('id', id, 'group_id', group_id))
    into before_rows from members
    where id = any(selected_member_ids) and (group_id = source_group_id or id = source_leader);
  if coalesce(jsonb_array_length(before_rows), 0) <> expected_count then
    raise exception '순 명단이 변경되었습니다. 다시 열어 확인해주세요.';
  end if;
  update members set group_id = target_group_id, updated_at = now()
    where id = any(selected_member_ids) and (group_id = source_group_id or id = source_leader);
  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception '일부 멤버를 변경할 권한이 없습니다. 아무도 이동하지 않았습니다.';
  end if;
  if source_leader = any(selected_member_ids) then
    update groups set leader_member_id = null, updated_at = now() where id = source_group_id;
  end if;
  return jsonb_build_object('count', changed_count, 'before', before_rows, 'previous_leader_id', source_leader);
end;
$$;
revoke all on function public.bulk_assign_group_members(uuid, uuid, uuid[]) from public;
grant execute on function public.bulk_assign_group_members(uuid, uuid, uuid[]) to authenticated;

create table if not exists public.prayer_meetings (
  id uuid primary key default gen_random_uuid(),
  event_date date not null unique,
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) between 1 and 100),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prayer_meetings_created_idx on public.prayer_meetings(created_at desc, id desc);
alter table public.prayer_meetings enable row level security;
revoke all on public.prayer_meetings from anon, authenticated;
grant select on public.prayer_meetings to authenticated;
drop policy if exists "active members read prayer history" on public.prayer_meetings;
create policy "active members read prayer history" on public.prayer_meetings for select to authenticated
using (current_member_id() is not null and coalesce(current_member_status() in ('active', 'care'), false));

-- Anonymous callers cannot address a row or page through historical events.
create or replace function public.get_latest_prayer_meeting()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('id', id, 'event_date', event_date, 'entries', entries,
    'version', version, 'created_at', created_at, 'updated_at', updated_at)
  from prayer_meetings order by event_date desc limit 1;
$$;
revoke all on function public.get_latest_prayer_meeting() from public;
grant execute on function public.get_latest_prayer_meeting() to anon, authenticated;

-- All writes go through version-checked, audited saves; no direct table writes.
create or replace function public.save_prayer_meeting(p_id uuid, p_version integer, p_event_date date, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior prayer_meetings%rowtype;
  saved prayer_meetings%rowtype;
  entry jsonb;
begin
  if auth.uid() is null or current_member_id() is null or not coalesce(current_member_status() in ('active', 'care'), false) then
    raise exception '로그인한 활성 멤버만 수정할 수 있습니다.';
  end if;
  if p_event_date is null or p_version is null or p_version < 0 then
    raise exception '날짜와 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '올바른 순서를 입력해주세요.';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
       or char_length(btrim(entry->>'title')) not between 1 and 120
       or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
       or (entry - 'title' - 'detail') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 기도회 버전이 올바르지 않습니다.'; end if;
    insert into prayer_meetings(event_date, entries) values(p_event_date, p_entries) returning * into saved;
  else
    select * into prior from prayer_meetings where id = p_id for update;
    if not found then raise exception '기도회를 찾을 수 없습니다.'; end if;
    if prior.version <> p_version then
      raise exception '다른 멤버가 먼저 수정했습니다. 작성 내용을 보관한 뒤 최신 순서를 다시 열어주세요.';
    end if;
    update prayer_meetings set event_date = p_event_date, entries = p_entries,
      version = version + 1, updated_at = now() where id = p_id returning * into saved;
  end if;
  perform record_audit_log(
    case when p_id is null then 'prayer.create' else 'prayer.update' end,
    'prayer_meetings', saved.id,
    case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved), '{}'::jsonb);
  return to_jsonb(saved);
exception when unique_violation then
  raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 수정해주세요.';
end;
$$;
revoke all on function public.save_prayer_meeting(uuid, integer, date, jsonb) from public;
grant execute on function public.save_prayer_meeting(uuid, integer, date, jsonb) to authenticated;


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


-- Publish link content only; member metadata and all write policies stay private.
create or replace function public.get_public_important_links()
returns table (id uuid, title text, description text, url text, icon_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.description, l.url, l.icon_key
  from public.important_links l
  order by l.display_order, l.created_at, l.id;
$$;

revoke all on function public.get_public_important_links() from public;
grant execute on function public.get_public_important_links() to anon, authenticated;

-- Apply after 041. Source links only; no lyrics are imported.
create table if not exists public.prayer_search_limits (
  member_id uuid primary key references public.members(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);
alter table public.prayer_search_limits enable row level security;
revoke all on public.prayer_search_limits from anon, authenticated;

create or replace function public.claim_prayer_source_search()
returns boolean language plpgsql security definer set search_path = public
as $$
declare actor uuid := current_member_id(); used integer;
begin
  if auth.uid() is null or actor is null or not coalesce(current_member_status() in ('active', 'care'), false) then
    raise exception '활성 멤버만 검색할 수 있습니다.';
  end if;
  insert into prayer_search_limits(member_id, window_start, requests)
  values(actor, now(), 1)
  on conflict(member_id) do update set
    requests = case when prayer_search_limits.window_start <= now() - interval '1 minute' then 1 else least(prayer_search_limits.requests + 1, 21) end,
    window_start = case when prayer_search_limits.window_start <= now() - interval '1 minute' then now() else prayer_search_limits.window_start end
  returning requests into used;
  return used <= 20;
end;
$$;
revoke all on function public.claim_prayer_source_search() from public;
grant execute on function public.claim_prayer_source_search() to authenticated;

-- All writes go through version-checked, audited saves; no direct table writes.
create or replace function public.save_prayer_meeting(p_id uuid, p_version integer, p_event_date date, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior prayer_meetings%rowtype;
  saved prayer_meetings%rowtype;
  entry jsonb;
begin
  if auth.uid() is null or current_member_id() is null or not coalesce(current_member_status() in ('active', 'care'), false) then
    raise exception '로그인한 활성 멤버만 수정할 수 있습니다.';
  end if;
  if p_event_date is null or p_version is null or p_version < 0 then
    raise exception '날짜와 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '올바른 순서를 입력해주세요.';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
       or char_length(btrim(entry->>'title')) not between 1 and 120
       or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
       or (entry - 'title' - 'detail' - 'sourceUrl') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (
      jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$')
    ) then raise exception 'HTTPS 원문 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 기도회 버전이 올바르지 않습니다.'; end if;
    insert into prayer_meetings(event_date, entries) values(p_event_date, p_entries) returning * into saved;
  else
    select * into prior from prayer_meetings where id = p_id for update;
    if not found then raise exception '기도회를 찾을 수 없습니다.'; end if;
    if prior.version <> p_version then
      raise exception '다른 멤버가 먼저 수정했습니다. 작성 내용을 보관한 뒤 최신 순서를 다시 열어주세요.';
    end if;
    update prayer_meetings set event_date = p_event_date, entries = p_entries,
      version = version + 1, updated_at = now() where id = p_id returning * into saved;
  end if;
  perform record_audit_log(
    case when p_id is null then 'prayer.create' else 'prayer.update' end,
    'prayer_meetings', saved.id,
    case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved), '{}'::jsonb);
  return to_jsonb(saved);
exception when unique_violation then
  raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 수정해주세요.';
end;
$$;
revoke all on function public.save_prayer_meeting(uuid, integer, date, jsonb) from public;
grant execute on function public.save_prayer_meeting(uuid, integer, date, jsonb) to authenticated;

-- Apply after 045. Shared templates are private to approved members.
create table if not exists public.prayer_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  entries jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.prayer_templates enable row level security;
revoke all on public.prayer_templates from anon, authenticated;
grant select on public.prayer_templates to authenticated;
create policy "registered members read prayer templates" on public.prayer_templates
for select to authenticated using (public.is_registered_member());

create or replace function public.save_prayer_template(p_id uuid, p_version integer, p_name text, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior prayer_templates%rowtype; saved prayer_templates%rowtype; entry jsonb;
begin
  if not public.is_registered_member() then raise exception '멤버 등록 승인 후 템플릿을 사용할 수 있습니다.'; end if;
  if p_version is null or p_version < 0 or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception '템플릿 이름과 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception '순서를 확인해주세요.'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
      or char_length(btrim(entry->>'title')) not between 1 and 120
      or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
      or (entry - 'title' - 'detail' - 'sourceUrl') <> '{}'::jsonb then
      raise exception '항목 이름과 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$'))
      then raise exception 'HTTPS 원문 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 템플릿 버전을 확인해주세요.'; end if;
    insert into prayer_templates(name, entries) values(btrim(p_name), p_entries) returning * into saved;
  else
    select * into prior from prayer_templates where id = p_id for update;
    if not found then raise exception '템플릿이 삭제되었습니다. 목록을 새로고침해주세요.'; end if;
    if prior.version <> p_version then raise exception '다른 멤버가 변경했습니다. 목록을 새로고침한 후 다시 확인해주세요.'; end if;
    update prayer_templates set name=btrim(p_name), entries=p_entries, version=version+1, updated_at=now()
      where id=p_id returning * into saved;
  end if;
  perform record_audit_log(case when p_id is null then 'prayer_template.create' else 'prayer_template.update' end,
    'prayer_templates', saved.id, case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;

create or replace function public.delete_prayer_template(p_id uuid, p_version integer)
returns void language plpgsql security definer set search_path = public
as $$
declare prior prayer_templates%rowtype;
begin
  if not public.is_registered_member() then raise exception '멤버 등록 승인 후 템플릿을 사용할 수 있습니다.'; end if;
  select * into prior from prayer_templates where id=p_id for update;
  if not found then raise exception '템플릿이 이미 삭제되었습니다.'; end if;
  if p_version is null or prior.version <> p_version then raise exception '다른 멤버가 변경했습니다. 목록을 새로고침한 후 다시 확인해주세요.'; end if;
  delete from prayer_templates where id=p_id;
  perform record_audit_log('prayer_template.delete', 'prayer_templates', p_id, to_jsonb(prior), null);
end;
$$;
revoke all on function public.save_prayer_template(uuid, integer, text, jsonb) from public;
revoke all on function public.delete_prayer_template(uuid, integer) from public;
grant execute on function public.save_prayer_template(uuid, integer, text, jsonb) to authenticated;
grant execute on function public.delete_prayer_template(uuid, integer) to authenticated;

-- Apply after 046. HTTP is allowed only for canonical HolyBible chapter links.
create or replace function public.is_prayer_bible_link(value text)
returns boolean language plpgsql immutable set search_path = public
as $$
declare parts text[]; book integer; chapter integer;
  chapters integer[] := array[50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
begin
  parts := regexp_match(value, '^http://www[.]holybible[.]or[.]kr/mobile/B_GAE/cgi-m/bibleftxt[.]php[?]VR=GAE&VL=([1-9][0-9]?)&CN=([1-9][0-9]{0,2})&CV=99$');
  if parts is null then return false; end if;
  book := parts[1]::integer; chapter := parts[2]::integer;
  return coalesce(book between 1 and 66 and chapter between 1 and chapters[book], false);
end;
$$;


create or replace function public.save_prayer_meeting(p_id uuid, p_version integer, p_event_date date, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior prayer_meetings%rowtype;
  saved prayer_meetings%rowtype;
  entry jsonb;
begin
  if auth.uid() is null or current_member_id() is null or not coalesce(current_member_status() in ('active', 'care'), false) then
    raise exception '로그인한 활성 멤버만 수정할 수 있습니다.';
  end if;
  if p_event_date is null or p_version is null or p_version < 0 then
    raise exception '날짜와 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '올바른 순서를 입력해주세요.';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
       or char_length(btrim(entry->>'title')) not between 1 and 120
       or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
       or (entry - 'title' - 'detail' - 'sourceUrl') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (
      jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl'))
    ) then raise exception '원문 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 기도회 버전이 올바르지 않습니다.'; end if;
    insert into prayer_meetings(event_date, entries) values(p_event_date, p_entries) returning * into saved;
  else
    select * into prior from prayer_meetings where id = p_id for update;
    if not found then raise exception '기도회를 찾을 수 없습니다.'; end if;
    if prior.version <> p_version then
      raise exception '다른 멤버가 먼저 수정했습니다. 작성 내용을 보관한 뒤 최신 순서를 다시 열어주세요.';
    end if;
    update prayer_meetings set event_date = p_event_date, entries = p_entries,
      version = version + 1, updated_at = now() where id = p_id returning * into saved;
  end if;
  perform record_audit_log(
    case when p_id is null then 'prayer.create' else 'prayer.update' end,
    'prayer_meetings', saved.id,
    case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved), '{}'::jsonb);
  return to_jsonb(saved);
exception when unique_violation then
  raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 수정해주세요.';
end;
$$;

create or replace function public.save_prayer_template(p_id uuid, p_version integer, p_name text, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior prayer_templates%rowtype; saved prayer_templates%rowtype; entry jsonb;
begin
  if not public.is_registered_member() then raise exception '멤버 등록 승인 후 템플릿을 사용할 수 있습니다.'; end if;
  if p_version is null or p_version < 0 or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception '템플릿 이름과 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception '순서를 확인해주세요.'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
      or char_length(btrim(entry->>'title')) not between 1 and 120
      or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
      or (entry - 'title' - 'detail' - 'sourceUrl') <> '{}'::jsonb then
      raise exception '항목 이름과 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl')))
      then raise exception '원문 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 템플릿 버전을 확인해주세요.'; end if;
    insert into prayer_templates(name, entries) values(btrim(p_name), p_entries) returning * into saved;
  else
    select * into prior from prayer_templates where id = p_id for update;
    if not found then raise exception '템플릿이 삭제되었습니다. 목록을 새로고침해주세요.'; end if;
    if prior.version <> p_version then raise exception '다른 멤버가 변경했습니다. 목록을 새로고침한 후 다시 확인해주세요.'; end if;
    update prayer_templates set name=btrim(p_name), entries=p_entries, version=version+1, updated_at=now()
      where id=p_id returning * into saved;
  end if;
  perform record_audit_log(case when p_id is null then 'prayer_template.create' else 'prayer_template.update' end,
    'prayer_templates', saved.id, case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;

-- Apply after 047. Keep the original sourceUrl and allow up to nine extra links.
create or replace function public.valid_prayer_additional_links(entry jsonb)
returns boolean language plpgsql immutable set search_path = public
as $$
declare link jsonb; value text;
begin
  if not (entry ? 'additionalSourceUrls') then return true; end if;
  if jsonb_typeof(entry->'additionalSourceUrls') is distinct from 'array' then return false; end if;
  if jsonb_array_length(entry->'additionalSourceUrls') > 9 then return false; end if;
  for link in select * from jsonb_array_elements(entry->'additionalSourceUrls') loop
    if jsonb_typeof(link) is distinct from 'string' then return false; end if;
    value := link #>> '{}';
    if char_length(value) > 2000 or (value <> ''
      and value !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$'
      and not public.is_prayer_bible_link(value)) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.save_prayer_meeting(p_id uuid, p_version integer, p_event_date date, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior prayer_meetings%rowtype;
  saved prayer_meetings%rowtype;
  entry jsonb;
begin
  if auth.uid() is null or current_member_id() is null or not coalesce(current_member_status() in ('active', 'care'), false) then
    raise exception '로그인한 활성 멤버만 수정할 수 있습니다.';
  end if;
  if p_event_date is null or p_version is null or p_version < 0 then
    raise exception '날짜와 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '올바른 순서를 입력해주세요.';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
       or char_length(btrim(entry->>'title')) not between 1 and 120
       or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
       or (entry - 'title' - 'detail' - 'sourceUrl' - 'additionalSourceUrls') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (
      jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl'))
    ) then raise exception '원문 링크를 확인해주세요.'; end if;
    if not public.valid_prayer_additional_links(entry) then raise exception '추가 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 기도회 버전이 올바르지 않습니다.'; end if;
    insert into prayer_meetings(event_date, entries) values(p_event_date, p_entries) returning * into saved;
  else
    select * into prior from prayer_meetings where id = p_id for update;
    if not found then raise exception '기도회를 찾을 수 없습니다.'; end if;
    if prior.version <> p_version then
      raise exception '다른 멤버가 먼저 수정했습니다. 작성 내용을 보관한 뒤 최신 순서를 다시 열어주세요.';
    end if;
    update prayer_meetings set event_date = p_event_date, entries = p_entries,
      version = version + 1, updated_at = now() where id = p_id returning * into saved;
  end if;
  perform record_audit_log(
    case when p_id is null then 'prayer.create' else 'prayer.update' end,
    'prayer_meetings', saved.id,
    case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved), '{}'::jsonb);
  return to_jsonb(saved);
exception when unique_violation then
  raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 수정해주세요.';
end;
$$;

create or replace function public.save_prayer_template(p_id uuid, p_version integer, p_name text, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior prayer_templates%rowtype; saved prayer_templates%rowtype; entry jsonb;
begin
  if not public.is_registered_member() then raise exception '멤버 등록 승인 후 템플릿을 사용할 수 있습니다.'; end if;
  if p_version is null or p_version < 0 or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception '템플릿 이름과 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception '순서를 확인해주세요.'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
      or char_length(btrim(entry->>'title')) not between 1 and 120
      or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
      or (entry - 'title' - 'detail' - 'sourceUrl' - 'additionalSourceUrls') <> '{}'::jsonb then
      raise exception '항목 이름과 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl')))
      then raise exception '원문 링크를 확인해주세요.'; end if;
    if not public.valid_prayer_additional_links(entry) then raise exception '추가 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 템플릿 버전을 확인해주세요.'; end if;
    insert into prayer_templates(name, entries) values(btrim(p_name), p_entries) returning * into saved;
  else
    select * into prior from prayer_templates where id = p_id for update;
    if not found then raise exception '템플릿이 삭제되었습니다. 목록을 새로고침해주세요.'; end if;
    if prior.version <> p_version then raise exception '다른 멤버가 변경했습니다. 목록을 새로고침한 후 다시 확인해주세요.'; end if;
    update prayer_templates set name=btrim(p_name), entries=p_entries, version=version+1, updated_at=now()
      where id=p_id returning * into saved;
  end if;
  perform record_audit_log(case when p_id is null then 'prayer_template.create' else 'prayer_template.update' end,
    'prayer_templates', saved.id, case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;

-- Apply after 048. Optional URL-keyed display labels; existing links remain valid.
create or replace function public.valid_prayer_additional_links(entry jsonb)
returns boolean language plpgsql immutable set search_path = public
as $$
declare link jsonb; value text; label_key text; label_value jsonb;
begin
  if entry ? 'sourceLabels' then
    if jsonb_typeof(entry->'sourceLabels') is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(entry->'sourceLabels')) > 10 then return false; end if;
    for label_key, label_value in select * from jsonb_each(entry->'sourceLabels') loop
      if jsonb_typeof(label_value) is distinct from 'string' or char_length(label_value #>> '{}') > 120 then return false; end if;
      if label_key is distinct from entry->>'sourceUrl'
        and not coalesce((entry->'additionalSourceUrls') ? label_key, false) then return false; end if;
    end loop;
  end if;
  if not (entry ? 'additionalSourceUrls') then return true; end if;
  if jsonb_typeof(entry->'additionalSourceUrls') is distinct from 'array' then return false; end if;
  if jsonb_array_length(entry->'additionalSourceUrls') > 9 then return false; end if;
  for link in select * from jsonb_array_elements(entry->'additionalSourceUrls') loop
    if jsonb_typeof(link) is distinct from 'string' then return false; end if;
    value := link #>> '{}';
    if char_length(value) > 2000 or (value <> ''
      and value !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$'
      and not public.is_prayer_bible_link(value)) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.save_prayer_meeting(p_id uuid, p_version integer, p_event_date date, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior prayer_meetings%rowtype;
  saved prayer_meetings%rowtype;
  entry jsonb;
begin
  if auth.uid() is null or current_member_id() is null or not coalesce(current_member_status() in ('active', 'care'), false) then
    raise exception '로그인한 활성 멤버만 수정할 수 있습니다.';
  end if;
  if p_event_date is null or p_version is null or p_version < 0 then
    raise exception '날짜와 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '올바른 순서를 입력해주세요.';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
       or char_length(btrim(entry->>'title')) not between 1 and 120
       or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
       or (entry - 'title' - 'detail' - 'sourceUrl' - 'additionalSourceUrls' - 'sourceLabels') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (
      jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl'))
    ) then raise exception '원문 링크를 확인해주세요.'; end if;
    if not public.valid_prayer_additional_links(entry) then raise exception '추가 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 기도회 버전이 올바르지 않습니다.'; end if;
    insert into prayer_meetings(event_date, entries) values(p_event_date, p_entries) returning * into saved;
  else
    select * into prior from prayer_meetings where id = p_id for update;
    if not found then raise exception '기도회를 찾을 수 없습니다.'; end if;
    if prior.version <> p_version then
      raise exception '다른 멤버가 먼저 수정했습니다. 작성 내용을 보관한 뒤 최신 순서를 다시 열어주세요.';
    end if;
    update prayer_meetings set event_date = p_event_date, entries = p_entries,
      version = version + 1, updated_at = now() where id = p_id returning * into saved;
  end if;
  perform record_audit_log(
    case when p_id is null then 'prayer.create' else 'prayer.update' end,
    'prayer_meetings', saved.id,
    case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved), '{}'::jsonb);
  return to_jsonb(saved);
exception when unique_violation then
  raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 수정해주세요.';
end;
$$;

create or replace function public.save_prayer_template(p_id uuid, p_version integer, p_name text, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior prayer_templates%rowtype; saved prayer_templates%rowtype; entry jsonb;
begin
  if not public.is_registered_member() then raise exception '멤버 등록 승인 후 템플릿을 사용할 수 있습니다.'; end if;
  if p_version is null or p_version < 0 or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception '템플릿 이름과 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception '순서를 확인해주세요.'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
      or char_length(btrim(entry->>'title')) not between 1 and 120
      or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
      or (entry - 'title' - 'detail' - 'sourceUrl' - 'additionalSourceUrls' - 'sourceLabels') <> '{}'::jsonb then
      raise exception '항목 이름과 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl')))
      then raise exception '원문 링크를 확인해주세요.'; end if;
    if not public.valid_prayer_additional_links(entry) then raise exception '추가 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 템플릿 버전을 확인해주세요.'; end if;
    insert into prayer_templates(name, entries) values(btrim(p_name), p_entries) returning * into saved;
  else
    select * into prior from prayer_templates where id = p_id for update;
    if not found then raise exception '템플릿이 삭제되었습니다. 목록을 새로고침해주세요.'; end if;
    if prior.version <> p_version then raise exception '다른 멤버가 변경했습니다. 목록을 새로고침한 후 다시 확인해주세요.'; end if;
    update prayer_templates set name=btrim(p_name), entries=p_entries, version=version+1, updated_at=now()
      where id=p_id returning * into saved;
  end if;
  perform record_audit_log(case when p_id is null then 'prayer_template.create' else 'prayer_template.update' end,
    'prayer_templates', saved.id, case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;

-- Latest public bulletin; private images and admin-only publication.
create table if not exists public.bulletin (
  singleton boolean primary key default true check (singleton),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  event_date date not null,
  image_path text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.bulletin enable row level security;
revoke all on public.bulletin from anon, authenticated;

create or replace function public.can_manage_bulletin()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and coalesce(public.current_member_status() in ('active','care'), false)
  and coalesce(public.current_member_role() in ('owner','admin'), false); $$;
revoke all on function public.can_manage_bulletin() from public;
grant execute on function public.can_manage_bulletin() to authenticated;

create or replace function public.get_public_bulletin()
returns jsonb language sql stable security definer set search_path = public
as $$ select jsonb_build_object('title', title, 'event_date', event_date, 'image_path', image_path, 'version', version)
  from public.bulletin where singleton; $$;
revoke all on function public.get_public_bulletin() from public;
grant execute on function public.get_public_bulletin() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bulletins', 'bulletins', false, 3145728, array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "public reads current bulletin image" on storage.objects for select to anon, authenticated
using (bucket_id = 'bulletins' and name = (public.get_public_bulletin()->>'image_path'));
create policy "admins upload bulletin images" on storage.objects for insert to authenticated
with check (bucket_id = 'bulletins' and public.can_manage_bulletin()
  and name ~ '^[0-9a-f-]{36}\.(jpg|png)$');
create policy "admins remove unpublished bulletin uploads" on storage.objects for delete to authenticated
using (bucket_id = 'bulletins' and public.can_manage_bulletin()
  and name is distinct from (public.get_public_bulletin()->>'image_path'));
create policy "admins inspect bulletin uploads" on storage.objects for select to authenticated
using (bucket_id = 'bulletins' and public.can_manage_bulletin());

create or replace function public.publish_bulletin(p_title text, p_date date, p_path text, p_version integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior public.bulletin%rowtype; saved public.bulletin%rowtype;
begin
  if not public.can_manage_bulletin() then raise exception '등록된 관리자만 주보를 올릴 수 있습니다.'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 or p_date is null
    or p_version is null or p_version < 0 or p_path is null or p_path !~ '^[0-9a-f-]{36}\.(jpg|png)$' then
    raise exception '주보 입력값을 확인해주세요.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'bulletins' and name = p_path) then
    raise exception '업로드된 이미지를 찾을 수 없습니다.';
  end if;
  -- Serialize even the first publication, where no row exists to lock yet.
  perform pg_advisory_xact_lock(50050);
  select * into prior from public.bulletin where singleton;
  if coalesce(prior.version, 0) <> p_version then
    raise exception '다른 관리자가 주보를 변경했습니다. 새로고침한 뒤 다시 확인해주세요.';
  end if;
  insert into public.bulletin(singleton,title,event_date,image_path,version)
  values (true,btrim(p_title),p_date,p_path,p_version+1)
  on conflict (singleton) do update set title=excluded.title, event_date=excluded.event_date,
    image_path=excluded.image_path, version=excluded.version, updated_at=now() returning * into saved;
  perform public.record_audit_log('bulletin.publish','bulletin',null,
    case when prior.version is null then null else to_jsonb(prior) end,to_jsonb(saved));
  return public.get_public_bulletin();
end;
$$;
revoke all on function public.publish_bulletin(text,date,text,integer) from public, anon;
grant execute on function public.publish_bulletin(text,date,text,integer) to authenticated;

-- Preserve the current bulletin while switching to one saved bulletin per date.
alter table public.bulletin drop constraint bulletin_pkey;
alter table public.bulletin drop column singleton;
alter table public.bulletin add primary key (event_date);

create or replace function public.get_public_bulletin()
returns jsonb language sql stable security definer set search_path = public
as $$ select jsonb_build_object('title', title, 'event_date', event_date, 'image_path', image_path, 'version', version)
  from public.bulletin order by event_date desc limit 1; $$;

create or replace function public.get_bulletin_history()
returns jsonb language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.can_manage_bulletin() then raise exception '관리자만 지난 주보를 볼 수 있습니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('title', title, 'event_date', event_date,
    'image_path', image_path, 'version', version) order by event_date desc) from public.bulletin), '[]'::jsonb);
end; $$;
revoke all on function public.get_bulletin_history() from public, anon;
grant execute on function public.get_bulletin_history() to authenticated;

drop policy "admins remove unpublished bulletin uploads" on storage.objects;
create or replace function public.is_saved_bulletin_image(p_path text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.bulletin where image_path=p_path); $$;
revoke all on function public.is_saved_bulletin_image(text) from public, anon;
grant execute on function public.is_saved_bulletin_image(text) to authenticated;
create policy "admins remove unpublished bulletin uploads" on storage.objects for delete to authenticated
using (bucket_id='bulletins' and public.can_manage_bulletin() and not public.is_saved_bulletin_image(name));

create or replace function public.publish_bulletin(p_title text, p_date date, p_path text, p_version integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior public.bulletin%rowtype; saved public.bulletin%rowtype;
begin
  if not public.can_manage_bulletin() then raise exception '등록된 관리자만 주보를 올릴 수 있습니다.'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 or p_date is null
    or p_version is null or p_version < 0 or p_path is null or p_path !~ '^[0-9a-f-]{36}\.(jpg|png)$' then
    raise exception '주보 입력값을 확인해주세요.';
  end if;
  perform pg_advisory_xact_lock(50050);
  if not exists(select 1 from storage.objects where bucket_id='bulletins' and name=p_path) then
    raise exception '업로드된 이미지를 찾을 수 없습니다.';
  end if;
  select * into prior from public.bulletin where event_date=p_date;
  if coalesce(prior.version,0) <> p_version then
    raise exception '이 날짜의 주보가 이미 저장되었거나 변경되었습니다. 목록에서 다시 열어주세요.';
  end if;
  insert into public.bulletin(title,event_date,image_path,version)
  values(btrim(p_title),p_date,p_path,p_version+1)
  on conflict(event_date) do update set title=excluded.title,image_path=excluded.image_path,
    version=excluded.version,updated_at=now() returning * into saved;
  perform public.record_audit_log('bulletin.publish','bulletin',null,
    case when prior.version is null then null else to_jsonb(prior) end,to_jsonb(saved));
  return to_jsonb(saved);
end; $$;

-- 052: Delegated prayer generation requests.
-- Apply after 051. A member delegates one new prayer meeting for one fixed date.
-- No service-role client or reusable member JWT is given to the agent. A callback
-- capability authorizes only its unexpired request; it cannot edit an old meeting.
create table if not exists public.prayer_generation_requests (
  id uuid primary key,
  member_id uuid references public.members(id) on delete set null,
  requester_auth_user_id uuid not null,
  event_date date not null,
  input jsonb not null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'needs_input', 'completed', 'failed', 'cancelled')),
  message text not null default '기도회 생성을 준비하고 있습니다.',
  result jsonb,
  meeting_id uuid references public.prayer_meetings(id),
  api_trigger_id text,
  run_id text,
  conversation_url text,
  dispatched_at timestamptz,
  polled_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or meeting_id is not null)
);
create index if not exists prayer_generation_member_created_idx
  on public.prayer_generation_requests(member_id, created_at desc, id desc);
create unique index if not exists prayer_generation_one_pending_date_idx
  on public.prayer_generation_requests(event_date) where status in ('queued', 'running');
alter table public.prayer_generation_requests enable row level security;
-- Even the requester reads a projection through RPCs, never the capability hash.
revoke all on public.prayer_generation_requests from public, anon, authenticated;

create or replace function public.prayer_generation_public(p_request public.prayer_generation_requests)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public
as $$
declare summary jsonb;
begin
  if p_request.result is not null then
    summary := jsonb_build_object(
      'songs', (select jsonb_agg(jsonb_build_object('title', song->'title', 'artist', song->'artist') order by position)
        from jsonb_array_elements(p_request.result->'songs') with ordinality as items(song, position)),
      'passage', p_request.result #> '{devotional,passage}',
      'devotionalTitle', p_request.result #> '{devotional,title}',
      'notes', p_request.result->'notes');
  end if;
  return jsonb_build_object(
    'id', p_request.id, 'event_date', p_request.event_date, 'input', p_request.input,
    'status', p_request.status, 'message', p_request.message, 'meeting_id', p_request.meeting_id,
    'result_summary', summary, 'created_at', p_request.created_at, 'updated_at', p_request.updated_at,
    'expires_at', p_request.expires_at, 'dispatched', p_request.dispatched_at is not null);
end;
$$;
revoke all on function public.prayer_generation_public(public.prayer_generation_requests) from public, anon, authenticated;

create or replace function public.require_prayer_generation_member()
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid;
begin
  -- The share lock also prevents registration/revocation from changing mid-save.
  select member.id into v_member_id from public.members as member
    where member.auth_user_id = auth.uid() and member.status in ('active', 'care') for share;
  if v_member_id is null then raise exception '멤버 등록 승인 후 기도회를 생성할 수 있습니다.'; end if;
  return v_member_id;
end;
$$;
revoke all on function public.require_prayer_generation_member() from public, anon, authenticated;

create or replace function public.expire_prayer_generation_requests(p_member_id uuid)
returns void language sql security definer set search_path = pg_catalog, public
as $$
  update public.prayer_generation_requests
    set status = 'failed', message = '요청 시간이 만료되었습니다. 새로 생성해주세요.', updated_at = clock_timestamp()
    where member_id = p_member_id and status in ('queued', 'running') and expires_at <= clock_timestamp();
$$;
revoke all on function public.expire_prayer_generation_requests(uuid) from public, anon, authenticated;

create or replace function public.lock_prayer_generation_callback(p_id uuid, p_token text)
returns public.prayer_generation_requests language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype; expected_hash text; v_member_id uuid;
begin
  if p_id is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  expected_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into request from public.prayer_generation_requests where id = p_id;
  if not found or request.token_hash is distinct from expected_hash or request.expires_at <= clock_timestamp() then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  -- Match BOTH identities captured at creation. A relinked/revoked member cannot
  -- retain delegated writes. Always lock the member before locking the request.
  select member.id into v_member_id from public.members as member
    where member.id = request.member_id and member.auth_user_id = request.requester_auth_user_id
      and member.status in ('active', 'care') for share;
  if v_member_id is null then raise exception '요청 인증을 확인해주세요.'; end if;
  select * into request from public.prayer_generation_requests where id = p_id for update;
  if not found or request.member_id is distinct from v_member_id
    or request.token_hash is distinct from expected_hash or request.expires_at <= clock_timestamp() then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  return request;
end;
$$;
revoke all on function public.lock_prayer_generation_callback(uuid, text) from public, anon, authenticated;

create or replace function public.valid_prayer_generation_result(p_input jsonb, p_entries jsonb, p_result jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public
as $$
declare song jsonb; entry jsonb; devotional jsonb; note jsonb; position integer; row_index integer;
  requested_title text; url_key text; bible_url text; verse_match text[]; end_chapter integer;
  book_names text[] := array['창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기','사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더','욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','에스겔','다니엘','호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기','마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서','갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서','베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록'];
begin
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_typeof(p_result) is distinct from 'object' then return false; end if;
  if jsonb_array_length(p_entries) <> 8 or octet_length(p_entries::text) > 60000
    or octet_length(p_result::text) > 65000
    or (p_result - array['songs','devotional','notes']) <> '{}'::jsonb
    or jsonb_typeof(p_result->'songs') is distinct from 'array'
    or jsonb_typeof(p_result->'devotional') is distinct from 'object'
    or jsonb_typeof(p_result->'notes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_result->'songs') <> 4 or jsonb_array_length(p_result->'notes') > 8 then return false; end if;
  if p_entries->0 <> jsonb_build_object('title','기도','detail','시작기도')
    or p_entries->3 <> jsonb_build_object('title','기도','detail',E'릴레이 기도\n마무리 기도')
    or p_entries->7 <> jsonb_build_object('title','기도','detail',E'통성기도\n마무리 기도') then return false; end if;
  for position in 0..3 loop
    song := p_result->'songs'->position;
    row_index := case when position < 2 then position + 1 else position + 3 end;
    entry := p_entries->row_index;
    requested_title := case when position < 2 then p_input->'beforeSongs'->>position else p_input->'afterSongs'->>(position - 2) end;
    if jsonb_typeof(song) is distinct from 'object' or jsonb_typeof(entry) is distinct from 'object' then return false; end if;
    if (song - array['requestedTitle','title','artist','lyricsUrl','scoreImageUrl','scoreSourceUrl','scoreKey','lyricsVerified','scoreImageVerified','verifiedAt']) <> '{}'::jsonb
      or song->>'requestedTitle' is distinct from requested_title
      or jsonb_typeof(song->'requestedTitle') is distinct from 'string'
      or jsonb_typeof(song->'title') is distinct from 'string'
      or char_length(btrim(song->>'title')) not between 1 and 120 or (song->>'title') ~ '[[:cntrl:]]'
      or jsonb_typeof(song->'artist') is distinct from 'string'
      or char_length(btrim(song->>'artist')) not between 1 and 120 or (song->>'artist') ~ '[[:cntrl:]]'
      or song->'lyricsVerified' is distinct from 'true'::jsonb
      or song->'scoreImageVerified' is distinct from 'true'::jsonb
      or jsonb_typeof(song->'verifiedAt') is distinct from 'string'
      or char_length(song->>'verifiedAt') > 64
      or (song->>'verifiedAt') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?Z$'
      or (song ? 'scoreKey' and (jsonb_typeof(song->'scoreKey') is distinct from 'string' or char_length(btrim(song->>'scoreKey')) not between 1 and 40 or (song->>'scoreKey') ~ '[[:cntrl:]]'))
      then return false; end if;
    foreach url_key in array array['lyricsUrl','scoreImageUrl','scoreSourceUrl'] loop
      if jsonb_typeof(song->url_key) is distinct from 'string' or char_length(song->>url_key) > 2000
        or (song->>url_key) !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' then return false; end if;
    end loop;
    if (song->>'lyricsUrl') !~ '^https://music[.]bugs[.]co[.]kr/track/[0-9]+/?$'
      or entry->>'title' is distinct from '찬양' or entry->>'detail' is distinct from song->>'title'
      or song->>'scoreImageUrl' = song->>'lyricsUrl' or song->>'scoreImageUrl' = song->>'scoreSourceUrl'
      or (song->>'scoreImageUrl') ~* '^https://([A-Za-z0-9-]+[.])*(duranno[.]com|fondant[.]kr|cgntv[.]net)([:/?#]|$)'
      or song->>'scoreImageUrl' = p_result#>>'{devotional,sourceUrl}'
      or (entry - array['title','detail','sourceUrl','additionalSourceUrls','sourceLabels']) <> '{}'::jsonb
      or entry->>'sourceUrl' is distinct from song->>'lyricsUrl'
      or entry->'additionalSourceUrls' is distinct from jsonb_build_array(song->>'scoreImageUrl')
      or entry->'sourceLabels' is distinct from jsonb_build_object(song->>'lyricsUrl','가사',song->>'scoreImageUrl','악보')
      then return false; end if;
  end loop;
  devotional := p_result->'devotional';
  if (devotional - array['date','title','book','chapter','passage','sourceUrl','verifiedAt']) <> '{}'::jsonb
    or devotional->>'date' is distinct from p_input->>'eventDate'
    or jsonb_typeof(devotional->'date') is distinct from 'string'
    or jsonb_typeof(devotional->'title') is distinct from 'string'
    or char_length(btrim(devotional->>'title')) not between 1 and 120 or (devotional->>'title') ~ '[[:cntrl:]]'
    or jsonb_typeof(devotional->'passage') is distinct from 'string'
    or char_length(btrim(devotional->>'passage')) not between 1 and 120 or (devotional->>'passage') ~ '[[:cntrl:]]'
    or jsonb_typeof(devotional->'book') is distinct from 'number' or (devotional->>'book') !~ '^[1-9][0-9]?$'
    or jsonb_typeof(devotional->'chapter') is distinct from 'number' or (devotional->>'chapter') !~ '^[1-9][0-9]{0,2}$'
    or jsonb_typeof(devotional->'sourceUrl') is distinct from 'string' or char_length(devotional->>'sourceUrl') > 2000
    or (devotional->>'sourceUrl') !~ '^https://(www[.])?(duranno[.]com|fondant[.]kr)([/?#][^[:space:]]*)?$'
    or jsonb_typeof(devotional->'verifiedAt') is distinct from 'string' or char_length(devotional->>'verifiedAt') > 64
    or (devotional->>'verifiedAt') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?Z$' then return false; end if;
  bible_url := 'http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL='
    || (devotional->>'book') || '&CN=' || (devotional->>'chapter') || '&CV=99';
  if not public.is_prayer_bible_link(bible_url) then return false; end if;
  verse_match := regexp_match(devotional->>'passage', '^' || book_names[(devotional->>'book')::integer]
    || ' ' || (devotional->>'chapter') || ':([1-9][0-9]{0,2})(?:[-–](?:([1-9][0-9]{0,2}):)?([1-9][0-9]{0,2}))?$');
  if verse_match is null then return false; end if;
  end_chapter := coalesce(verse_match[2]::integer,(devotional->>'chapter')::integer);
  if end_chapter < (devotional->>'chapter')::integer
    or not public.is_prayer_bible_link('http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL='
      ||(devotional->>'book')||'&CN='||end_chapter||'&CV=99')
    or (end_chapter = (devotional->>'chapter')::integer and coalesce(verse_match[3]::integer,verse_match[1]::integer) < verse_match[1]::integer)
    then return false; end if;
  entry := p_entries->4;
  if not public.is_prayer_bible_link(bible_url) or jsonb_typeof(entry) is distinct from 'object'
    or (entry - array['title','detail','sourceUrl','additionalSourceUrls','sourceLabels']) <> '{}'::jsonb
    or entry->>'title' is distinct from '묵상/나눔'
    or entry->>'detail' is distinct from (devotional->>'passage') || E'\n생명의삶 — ' || (devotional->>'title')
    or entry->>'sourceUrl' is distinct from bible_url
    or (entry ? 'additionalSourceUrls' and entry->'additionalSourceUrls' <> '[]'::jsonb) then return false; end if;
  for note in select * from jsonb_array_elements(p_result->'notes') loop
    if jsonb_typeof(note) is distinct from 'string' or char_length(btrim(note #>> '{}')) not between 1 and 300 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_prayer_generation_result(jsonb, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.create_prayer_generation_request(p_id uuid, p_input jsonb, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype; v_event_date date; song jsonb;
begin
  v_member_id := public.require_prayer_generation_member();
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception '생성 요청을 확인해주세요.'; end if;
  if (p_input - array['eventDate','beforeSongs','afterSongs']) <> '{}'::jsonb
    or jsonb_typeof(p_input->'eventDate') is distinct from 'string' or (p_input->>'eventDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(p_input->'beforeSongs') is distinct from 'array'
    or jsonb_typeof(p_input->'afterSongs') is distinct from 'array' then raise exception '날짜와 찬양을 확인해주세요.'; end if;
  if jsonb_array_length(p_input->'beforeSongs') <> 2 or jsonb_array_length(p_input->'afterSongs') <> 2 then
    raise exception '말씀 전후 찬양을 각각 두 곡씩 입력해주세요.';
  end if;
  begin v_event_date := (p_input->>'eventDate')::date;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception '올바른 날짜를 선택해주세요.'; end;
  for song in select * from jsonb_array_elements((p_input->'beforeSongs') || (p_input->'afterSongs')) loop
    if jsonb_typeof(song) is distinct from 'string' or char_length(btrim(song #>> '{}')) not between 1 and 120
      or (song #>> '{}') <> btrim(song #>> '{}') or (song #>> '{}') ~ '[[:cntrl:]]' then
      raise exception '찬양 제목을 120자 이내로 입력해주세요.';
    end if;
  end loop;
  -- Serialize a member's admissions so simultaneous requests cannot evade limits.
  perform pg_advisory_xact_lock(hashtext('newavely.prayer_generation'), hashtext(v_member_id::text));
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests where id = p_id;
  if found then
    if request.member_id is distinct from v_member_id or request.requester_auth_user_id is distinct from auth.uid()
      or request.input is distinct from p_input or request.token_hash is distinct from p_token_hash then
      raise exception '같은 요청 번호의 입력이 다릅니다. 새로 요청해주세요.';
    end if;
    return public.prayer_generation_public(request);
  end if;
  if exists (select 1 from public.prayer_meetings as meeting where meeting.event_date = v_event_date) then
    raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 확인해주세요.';
  end if;
  update public.prayer_generation_requests as expired
    set status = 'failed', message = '요청 시간이 만료되었습니다. 새로 생성해주세요.', updated_at = clock_timestamp()
    where expired.event_date = v_event_date and expired.status in ('queued','running')
      and expired.expires_at <= clock_timestamp();
  if (select count(*) from public.prayer_generation_requests as recent
    where recent.member_id = v_member_id and recent.created_at >= clock_timestamp() - interval '1 hour') >= 5 then
    raise exception '기도회 자동 생성은 한 시간에 다섯 번까지 요청할 수 있습니다.';
  end if;
  if (select count(*) from public.prayer_generation_requests as pending
    where pending.member_id = v_member_id and pending.status in ('queued','running')) >= 2 then
    raise exception '진행 중인 생성 요청을 마치거나 취소한 뒤 다시 요청해주세요.';
  end if;
  insert into public.prayer_generation_requests(id, member_id, requester_auth_user_id, event_date, input, token_hash)
    values(p_id, v_member_id, auth.uid(), v_event_date, p_input, p_token_hash) returning * into request;
  perform public.record_audit_log('prayer_generation.create', 'prayer_generation_requests', request.id, null,
    jsonb_build_object('event_date',request.event_date,'input',request.input,'status',request.status), '{}'::jsonb);
  return public.prayer_generation_public(request);
exception when unique_violation then
  raise exception '해당 날짜의 생성 요청이 이미 진행 중입니다. 잠시 후 기도회를 확인해주세요.';
end;
$$;
revoke all on function public.create_prayer_generation_request(uuid, jsonb, text) from public, anon;
grant execute on function public.create_prayer_generation_request(uuid, jsonb, text) to authenticated;

create or replace function public.get_prayer_generation_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid();
  if not found then return null; end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.get_prayer_generation_request(uuid) from public, anon;
grant execute on function public.get_prayer_generation_request(uuid) to authenticated;

create or replace function public.list_prayer_generation_requests()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype; results jsonb := '[]'::jsonb;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  for request in select * from public.prayer_generation_requests as own
    where own.member_id = v_member_id and own.requester_auth_user_id = auth.uid()
    order by (own.status in ('queued','running')) desc, own.created_at desc, own.id desc limit 5 loop
    results := results || jsonb_build_array(public.prayer_generation_public(request));
  end loop;
  return results;
end;
$$;
revoke all on function public.list_prayer_generation_requests() from public, anon;
grant execute on function public.list_prayer_generation_requests() to authenticated;

create or replace function public.mark_prayer_generation_dispatched(p_id uuid, p_api_trigger_id text, p_run_id text default null, p_conversation_url text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  if p_api_trigger_id is null or p_api_trigger_id !~ '^agtch_[A-Za-z0-9_-]{1,160}$'
    or (p_run_id is not null and p_run_id !~ '^apirun_[A-Za-z0-9_-]{1,160}$')
    or (p_conversation_url is not null and (char_length(p_conversation_url) > 2000 or p_conversation_url !~ '^https://chatgpt[.]com/[^[:space:]]+$')) then
    raise exception '에이전트 접수 정보를 확인해주세요.';
  end if;
  if (request.api_trigger_id is not null and request.api_trigger_id <> p_api_trigger_id)
    or (request.run_id is not null and request.run_id is distinct from p_run_id) then
    raise exception '이미 접수된 요청의 실행 정보를 바꿀 수 없습니다.';
  end if;
  update public.prayer_generation_requests set api_trigger_id = p_api_trigger_id, run_id = p_run_id,
    conversation_url = p_conversation_url, dispatched_at = coalesce(dispatched_at,clock_timestamp()), updated_at = clock_timestamp(),
    message = case when status = 'queued' then '생성 요청을 접수했습니다. 찬양과 말씀 자료를 확인하고 있습니다.' else message end
    where id = request.id returning * into request;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.mark_prayer_generation_dispatched(uuid, text, text, text) from public, anon;
grant execute on function public.mark_prayer_generation_dispatched(uuid, text, text, text) to authenticated;

create or replace function public.fail_prayer_generation_dispatch(p_id uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 500 then raise exception '처리 결과를 확인해주세요.'; end if;
  if request.status in ('queued','running') then
    update public.prayer_generation_requests set status = 'failed', message = btrim(p_message), updated_at = clock_timestamp()
      where id = request.id returning * into request;
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.fail_prayer_generation_dispatch(uuid, text) from public, anon;
grant execute on function public.fail_prayer_generation_dispatch(uuid, text) to authenticated;

create or replace function public.cancel_prayer_generation_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  if request.status in ('queued','running') then
    update public.prayer_generation_requests set status = 'cancelled', message = '생성 요청을 취소했습니다.', updated_at = clock_timestamp()
      where id = request.id returning * into request;
    perform public.record_audit_log('prayer_generation.cancel', 'prayer_generation_requests', request.id,
      null, jsonb_build_object('status','cancelled'), '{}'::jsonb);
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.cancel_prayer_generation_request(uuid) from public, anon;
grant execute on function public.cancel_prayer_generation_request(uuid) to authenticated;

create or replace function public.claim_prayer_generation_poll(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  -- Only the app server knows the capability for an app-created request.
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$'
    or request.token_hash is distinct from encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  if request.status not in ('queued','running') or request.run_id is null or request.api_trigger_id is null
    or request.polled_at > clock_timestamp() - interval '15 seconds' then return null; end if;
  update public.prayer_generation_requests set polled_at = clock_timestamp() where id = request.id;
  return jsonb_build_object('api_trigger_id',request.api_trigger_id,'run_id',request.run_id);
end;
$$;
revoke all on function public.claim_prayer_generation_poll(uuid, text) from public, anon;
grant execute on function public.claim_prayer_generation_poll(uuid, text) to authenticated;

create or replace function public.get_prayer_generation_task(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  return jsonb_build_object('id',request.id,'input',request.input,'status',request.status,
    'created_at',request.created_at,'expires_at',request.expires_at);
end;
$$;
revoke all on function public.get_prayer_generation_task(uuid, text) from public;
grant execute on function public.get_prayer_generation_task(uuid, text) to anon, authenticated;

create or replace function public.report_prayer_generation_status(p_id uuid, p_token text, p_status text, p_message text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if p_status is null or p_status not in ('running','needs_input','failed')
    or p_message is null or char_length(btrim(p_message)) not between 1 and 300
    or strpos(p_message,p_token) > 0 then raise exception '처리 상태를 확인해주세요.'; end if;
  if request.status in ('queued','running') then
    update public.prayer_generation_requests set status = p_status, message = btrim(p_message), updated_at = clock_timestamp()
      where id = request.id returning * into request;
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.report_prayer_generation_status(uuid, text, text, text) from public;
grant execute on function public.report_prayer_generation_status(uuid, text, text, text) to anon, authenticated;

create or replace function public.complete_prayer_generation_request(p_id uuid, p_token text, p_entries jsonb, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype; saved jsonb;
  prior_sub text; prior_claims text; date_conflict boolean := false; checked jsonb; verified_at timestamptz;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if request.status = 'completed' then return public.prayer_generation_public(request); end if;
  if request.status not in ('queued','running') then raise exception '종료된 생성 요청입니다. 새로 요청해주세요.'; end if;
  if strpos(p_entries::text,p_token) > 0 or strpos(p_result::text,p_token) > 0
    or not public.valid_prayer_generation_result(request.input, p_entries, p_result) then
    raise exception '찬양, 악보, 말씀의 확인 결과를 다시 확인해주세요.';
  end if;
  for checked in select * from jsonb_array_elements((p_result->'songs') || jsonb_build_array(p_result->'devotional')) loop
    begin verified_at := (checked->>'verifiedAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception '자료를 이번 요청에서 다시 확인해주세요.';
    end;
    if verified_at > clock_timestamp() + interval '5 minutes'
      or verified_at < greatest(request.created_at - interval '5 minutes', clock_timestamp() - interval '24 hours') then
      raise exception '자료를 이번 요청에서 다시 확인해주세요.';
    end if;
  end loop;
  if exists (select 1 from public.prayer_meetings where event_date = request.event_date) then
    date_conflict := true;
  else
    -- The capability has already been checked and its original member is locked.
    -- Delegate only this new, fixed-date save to the existing validation/audit RPC.
    -- No caller-supplied identity, meeting ID, version or event date is accepted.
    prior_sub := current_setting('request.jwt.claim.sub', true);
    prior_claims := current_setting('request.jwt.claims', true);
    begin
      perform set_config('request.jwt.claim.sub', request.requester_auth_user_id::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub',request.requester_auth_user_id,'role','authenticated')::text, true);
      saved := public.save_prayer_meeting(null, 0, request.event_date, p_entries);
      perform public.record_audit_log('prayer_generation.complete','prayer_generation_requests',request.id,
        null,jsonb_build_object('meeting_id',saved->'id','status','completed'),jsonb_build_object('source','workspace_agent'));
      perform set_config('request.jwt.claim.sub', coalesce(prior_sub,''), true);
      perform set_config('request.jwt.claims', coalesce(prior_claims,''), true);
    exception when others then
      perform set_config('request.jwt.claim.sub', coalesce(prior_sub,''), true);
      perform set_config('request.jwt.claims', coalesce(prior_claims,''), true);
      -- A manual save may win the date uniqueness race after the first check.
      -- Preserve that meeting and expose a conflict; all other save errors escape.
      if sqlstate = 'P0001' and exists (select 1 from public.prayer_meetings where event_date = request.event_date) then
        date_conflict := true;
      else raise; end if;
    end;
  end if;
  if date_conflict then
    update public.prayer_generation_requests set status = 'needs_input',
      message = '해당 날짜의 기도회가 이미 만들어졌습니다. 기존 기도회를 확인해주세요.', updated_at = clock_timestamp()
      where id = request.id returning * into request;
  else
    update public.prayer_generation_requests set status = 'completed', message = '기도회를 생성하고 저장했습니다.',
      meeting_id = (saved->>'id')::uuid, result = p_result, updated_at = clock_timestamp()
      where id = request.id returning * into request;
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.complete_prayer_generation_request(uuid, text, jsonb, jsonb) from public;
grant execute on function public.complete_prayer_generation_request(uuid, text, jsonb, jsonb) to anon, authenticated;
