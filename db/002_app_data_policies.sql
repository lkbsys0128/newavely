create policy "users can create their own member profile"
on members for insert
to authenticated
with check (auth_user_id = auth.uid());

create policy "users can update their own member profile"
on members for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

create policy "admins and leaders can read custom field definitions"
on member_custom_field_definitions for select
to authenticated
using (current_member_role() in ('admin', 'leader'));
