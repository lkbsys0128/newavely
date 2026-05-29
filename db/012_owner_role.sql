alter type member_role add value if not exists 'owner' before 'admin';

update members
set role = 'owner'
where id = (
  select id
  from members
  where role = 'admin' and status <> 'inactive'
  order by created_at asc
  limit 1
)
and not exists (
  select 1 from members where role = 'owner'
);

create or replace function can_manage_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_member_role() in ('owner', 'admin', 'leader');
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
  select current_member_role() in ('owner', 'admin', 'leader');
$$;

drop policy if exists "admins can write groups" on groups;
drop policy if exists "owners and admins can write groups" on groups;
create policy "owners and admins can write groups"
on groups for all
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));

drop policy if exists "admins can delete members" on members;
drop policy if exists "owners can delete members" on members;
create policy "owners can delete members"
on members for delete
to authenticated
using (current_member_role() = 'owner');

drop policy if exists "admins can read audit logs" on audit_logs;
drop policy if exists "owners and admins can read audit logs" on audit_logs;
create policy "owners and admins can read audit logs"
on audit_logs for select
to authenticated
using (current_member_role() in ('owner', 'admin'));

drop policy if exists "admins and leaders can insert members" on members;
create policy "admins and leaders can insert members"
on members for insert
to authenticated
with check (
  current_member_role() = 'owner'
  or (current_member_role() = 'admin' and role <> 'owner')
  or (current_member_role() = 'leader' and role = 'member')
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
);

drop policy if exists "admins can manage custom field definitions" on member_custom_field_definitions;
drop policy if exists "owners and admins can manage custom field definitions" on member_custom_field_definitions;
create policy "owners and admins can manage custom field definitions"
on member_custom_field_definitions for all
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));

drop policy if exists "admins and leaders can read custom field definitions" on member_custom_field_definitions;
create policy "admins and leaders can read custom field definitions"
on member_custom_field_definitions for select
to authenticated
using (current_member_role() in ('owner', 'admin', 'leader'));

drop policy if exists "users can read their own link requests" on member_link_requests;
create policy "users can read their own link requests"
on member_link_requests for select
to authenticated
using (
  requester_member_id = current_member_id()
  or current_member_role() in ('owner', 'admin')
);

drop policy if exists "admins can update link requests" on member_link_requests;
drop policy if exists "owners and admins can update link requests" on member_link_requests;
create policy "owners and admins can update link requests"
on member_link_requests for update
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));
