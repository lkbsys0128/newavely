alter type member_role add value if not exists 'assistant' after 'staff';

commit;

create or replace function can_read_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('owner', 'admin', 'leader', 'staff', 'assistant');
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

drop policy if exists "admins and leaders can insert members" on members;
create policy "admins and leaders can insert members"
on members for insert
to authenticated
with check (
  current_member_role() = 'owner'
  or (current_member_role() = 'admin' and role <> 'owner')
  or (current_member_role() = 'leader' and role in ('member', 'assistant'))
  or (current_member_role() = 'staff' and role in ('member', 'assistant'))
);

drop policy if exists "admins and leaders can update members" on members;
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

drop policy if exists "authorized users can read attendance records" on attendance_records;
create policy "authorized users can read attendance records"
on attendance_records for select
to authenticated
using (
  current_member_role() in ('owner', 'admin', 'leader', 'staff', 'assistant', 'welcome')
  or member_id in (select id from members where auth_user_id = auth.uid())
);

drop policy if exists "authorized users can manage attendance records" on attendance_records;
create policy "authorized users can manage attendance records"
on attendance_records for all
to authenticated
using (can_manage_attendance())
with check (can_manage_attendance());

drop policy if exists "admins and leaders can manage attendance events" on attendance_events;
create policy "admins and leaders can manage attendance events"
on attendance_events for all
to authenticated
using (can_manage_attendance_events())
with check (can_manage_attendance_events());
