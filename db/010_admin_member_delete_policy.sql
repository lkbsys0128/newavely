drop policy if exists "admins can delete members" on members;

create policy "admins can delete members"
on members for delete
to authenticated
using (current_member_role() = 'admin');
