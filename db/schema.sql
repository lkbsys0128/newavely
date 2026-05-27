create type member_role as enum ('admin', 'leader', 'staff', 'member');
create type member_status as enum ('active', 'new', 'care', 'inactive');
create type attendance_status as enum ('present', 'absent', 'excused');

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

create index members_group_idx on members(group_id);
create index members_role_idx on members(role);
create index members_auth_user_idx on members(auth_user_id);
create index attendance_records_event_idx on attendance_records(event_id);
create index attendance_records_member_idx on attendance_records(member_id);

alter table groups enable row level security;
alter table members enable row level security;
alter table attendance_events enable row level security;
alter table attendance_records enable row level security;
alter table member_custom_field_definitions enable row level security;

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

create or replace function can_manage_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('admin', 'leader');
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

create policy "authenticated users can read active members"
on members for select
to authenticated
using (status <> 'inactive' or auth_user_id = auth.uid() or current_member_role() = 'admin');

create policy "users can create their own member profile"
on members for insert
to authenticated
with check (auth_user_id = auth.uid());

create policy "admins and leaders can insert members"
on members for insert
to authenticated
with check (can_manage_members());

create policy "users can update their own member profile"
on members for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

create policy "admins and leaders can update members"
on members for update
to authenticated
using (can_manage_members() or auth_user_id = auth.uid())
with check (can_manage_members() or auth_user_id = auth.uid());

create policy "authenticated users can read attendance events"
on attendance_events for select
to authenticated
using (true);

create policy "admins and leaders can manage attendance events"
on attendance_events for all
to authenticated
using (can_manage_attendance())
with check (can_manage_attendance());

create policy "authenticated users can read attendance records"
on attendance_records for select
to authenticated
using (true);

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
