drop policy if exists "owners can delete members" on members;
drop policy if exists "authorized users can delete lower role members" on members;

create policy "authorized users can delete lower role members"
on members for delete
to authenticated
using (
  current_member_role() in ('owner', 'admin', 'leader')
  and
  case current_member_role()
    when 'owner' then 5
    when 'admin' then 4
    when 'leader' then 3
    when 'staff' then 2
    when 'member' then 1
    else 0
  end >
  case role
    when 'owner' then 5
    when 'admin' then 4
    when 'leader' then 3
    when 'staff' then 2
    when 'member' then 1
    else 0
  end
);

drop policy if exists "leaders can delete groups" on groups;

create policy "leaders can delete groups"
on groups for delete
to authenticated
using (current_member_role() in ('owner', 'admin', 'leader'));
