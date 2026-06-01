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
  select current_member_role() in ('owner', 'admin', 'leader', 'staff');
$$;

drop policy if exists "admins and leaders can insert members" on members;
create policy "admins and leaders can insert members"
on members for insert
to authenticated
with check (
  current_member_role() = 'owner'
  or (current_member_role() = 'admin' and role <> 'owner')
  or (current_member_role() = 'leader' and role = 'member')
  or (current_member_role() = 'staff' and role = 'member')
);

drop policy if exists "admins and leaders can update members" on members;
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

drop policy if exists "authorized users can delete lower role members" on members;
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

drop policy if exists "authorized users can create deleted auth blocks" on deleted_auth_users;
create policy "authorized users can create deleted auth blocks"
on deleted_auth_users for insert
to authenticated
with check (current_member_role() in ('owner', 'admin', 'leader', 'staff'));

drop policy if exists "leaders can delete groups" on groups;
create policy "leaders can delete groups"
on groups for delete
to authenticated
using (current_member_role() in ('owner', 'admin', 'leader', 'staff'));

drop policy if exists "admins and leaders can read custom field definitions" on member_custom_field_definitions;
create policy "admins and leaders can read custom field definitions"
on member_custom_field_definitions for select
to authenticated
using (current_member_role() in ('owner', 'admin', 'leader', 'staff'));
