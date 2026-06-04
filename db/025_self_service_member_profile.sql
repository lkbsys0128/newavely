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
  limit 1
$$;

drop policy if exists "users can update their own member profile" on members;
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
