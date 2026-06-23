create type member_role as enum ('owner', 'admin', 'leader', 'staff', 'welcome', 'member');
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
alter table attendance_records enable row level security;
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
  select current_member_role() in ('owner', 'admin', 'leader', 'staff');
$$;

create or replace function can_manage_attendance()
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
  or (current_member_role() = 'leader' and role = 'member')
  or (current_member_role() = 'staff' and role = 'member')
);

create policy "admins and leaders can update members"
on members for update
to authenticated
using (can_manage_members())
with check (
  current_member_role() = 'owner'
  or (current_member_role() = 'admin' and role <> 'owner')
  or (current_member_role() = 'leader' and role = 'member')
  or (current_member_role() = 'staff' and role = 'member')
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
  current_member_role() in ('owner', 'admin', 'leader', 'staff')
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
using (can_manage_attendance())
with check (can_manage_attendance());

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
  group by m.role
  order by m.role;
$$;

revoke all on function get_public_dashboard_groups() from public;
revoke all on function get_public_dashboard_members() from public;
revoke all on function get_public_permission_role_counts() from public;
grant execute on function get_public_dashboard_groups() to authenticated;
grant execute on function get_public_dashboard_members() to authenticated;
grant execute on function get_public_permission_role_counts() to authenticated;
