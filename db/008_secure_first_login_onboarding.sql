alter table member_link_requests
  alter column target_member_id drop not null;

alter table member_link_requests
  drop constraint if exists member_link_requests_distinct_members;

alter table member_link_requests
  add constraint member_link_requests_distinct_members
  check (target_member_id is null or requester_member_id <> target_member_id);

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

create or replace function can_read_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('owner', 'admin', 'leader', 'staff');
$$;

drop policy if exists "authenticated users can read active members" on members;
drop policy if exists "authenticated users can read allowed members" on members;
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

drop policy if exists "users can create their own member profile" on members;
create policy "users can create their own pending member profile"
on members for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and role = 'member'
  and status = 'new'
);

drop policy if exists "users can update their own member profile" on members;
drop policy if exists "admins and leaders can update members" on members;
create policy "admins and leaders can update members"
on members for update
to authenticated
using (can_manage_members())
with check (
  current_member_role() = 'owner'
  or (current_member_role() = 'admin' and role <> 'owner')
  or (current_member_role() = 'leader' and role = 'member')
);

drop policy if exists "users can read their own link requests" on member_link_requests;
create policy "users can read their own link requests"
on member_link_requests for select
to authenticated
using (
  requester_member_id = current_member_id()
  or current_member_role() in ('owner', 'admin')
);

drop policy if exists "users can create their own link requests" on member_link_requests;
create policy "users can create their own link requests"
on member_link_requests for insert
to authenticated
with check (
  requester_member_id = current_member_id()
);

drop policy if exists "authenticated users can read attendance records" on attendance_records;
drop policy if exists "authorized users can read attendance records" on attendance_records;
create policy "authorized users can read attendance records"
on attendance_records for select
to authenticated
using (
  current_member_role() in ('owner', 'admin', 'leader', 'staff')
  or member_id in (select id from members where auth_user_id = auth.uid())
);
