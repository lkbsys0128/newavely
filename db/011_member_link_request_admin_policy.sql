drop policy if exists "admins can update link requests" on member_link_requests;
drop policy if exists "owners and admins can update link requests" on member_link_requests;

create policy "owners and admins can update link requests"
on member_link_requests for update
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));
