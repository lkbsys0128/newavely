drop policy if exists "admins can update link requests" on member_link_requests;

create policy "admins can update link requests"
on member_link_requests for update
to authenticated
using (current_member_role() = 'admin')
with check (current_member_role() = 'admin');
