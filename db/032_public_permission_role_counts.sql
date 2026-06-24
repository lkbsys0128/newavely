create or replace function get_public_permission_role_counts()
returns table (
  role member_role,
  member_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.role,
    count(*) as member_count
  from members m
  where m.status <> 'inactive'
    and coalesce(m.email, '') not ilike '%@merged.local'
    and coalesce((m.custom_fields ->> 'test_account')::boolean, false) = false
  group by m.role
  order by m.role;
$$;

revoke all on function get_public_permission_role_counts() from public;
grant execute on function get_public_permission_role_counts() to authenticated;
