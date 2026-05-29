drop policy if exists "admins can delete members" on members;
drop policy if exists "owners can delete members" on members;

create policy "owners can delete members"
on members for delete
to authenticated
using (current_member_role() = 'owner');
