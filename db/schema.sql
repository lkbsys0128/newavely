create type member_role as enum ('admin', 'leader', 'staff', 'member');
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

create index members_group_idx on members(group_id);
create index members_role_idx on members(role);
create index members_auth_user_idx on members(auth_user_id);
create index attendance_records_event_idx on attendance_records(event_id);
create index attendance_records_member_idx on attendance_records(member_id);
create index care_followups_member_idx on care_followups(member_id);
create index care_followups_status_idx on care_followups(status);
create unique index member_link_requests_one_pending_per_requester_idx
on member_link_requests(requester_member_id)
where status = 'pending';
create index member_link_requests_target_idx on member_link_requests(target_member_id);
create index member_link_requests_status_idx on member_link_requests(status);

alter table groups enable row level security;
alter table members enable row level security;
alter table attendance_events enable row level security;
alter table attendance_records enable row level security;
alter table member_custom_field_definitions enable row level security;
alter table care_followups enable row level security;
alter table member_link_requests enable row level security;

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

create or replace function can_manage_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('admin', 'leader');
$$;

create or replace function can_read_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('admin', 'leader', 'staff');
$$;

create or replace function can_manage_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('admin', 'leader');
$$;

create policy "authenticated users can read groups"
on groups for select
to authenticated
using (true);

create policy "admins can write groups"
on groups for all
to authenticated
using (current_member_role() = 'admin')
with check (current_member_role() = 'admin');

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
with check (can_manage_members());

create policy "admins and leaders can update members"
on members for update
to authenticated
using (can_manage_members())
with check (can_manage_members());

create policy "admins can delete members"
on members for delete
to authenticated
using (current_member_role() = 'admin');

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
  current_member_role() in ('admin', 'leader', 'staff')
  or member_id in (select id from members where auth_user_id = auth.uid())
);

create policy "admins and leaders can manage attendance records"
on attendance_records for all
to authenticated
using (can_manage_attendance())
with check (can_manage_attendance());

create policy "admins can manage custom field definitions"
on member_custom_field_definitions for all
to authenticated
using (current_member_role() = 'admin')
with check (current_member_role() = 'admin');

create policy "admins and leaders can read custom field definitions"
on member_custom_field_definitions for select
to authenticated
using (current_member_role() in ('admin', 'leader'));

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
  or current_member_role() = 'admin'
);

create policy "users can create their own link requests"
on member_link_requests for insert
to authenticated
with check (
  requester_member_id = current_member_id()
);

create policy "admins can update link requests"
on member_link_requests for update
to authenticated
using (current_member_role() = 'admin')
with check (current_member_role() = 'admin');
