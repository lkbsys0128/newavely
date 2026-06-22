drop policy if exists "owners and admins can read new family applicants" on new_family_applicants;
drop policy if exists "owners admins and welcome can read new family applicants" on new_family_applicants;
create policy "owners admins and welcome can read new family applicants"
on new_family_applicants for select
to authenticated
using (public.current_member_role() in ('owner', 'admin', 'welcome'));

drop policy if exists "owners and admins can create new family applicants" on new_family_applicants;
drop policy if exists "owners admins and welcome can create new family applicants" on new_family_applicants;
create policy "owners admins and welcome can create new family applicants"
on new_family_applicants for insert
to authenticated
with check (public.current_member_role() in ('owner', 'admin', 'welcome'));

drop policy if exists "owners and admins can update new family applicants" on new_family_applicants;
drop policy if exists "owners admins and welcome can update new family applicants" on new_family_applicants;
create policy "owners admins and welcome can update new family applicants"
on new_family_applicants for update
to authenticated
using (public.current_member_role() in ('owner', 'admin', 'welcome'))
with check (public.current_member_role() in ('owner', 'admin', 'welcome'));
