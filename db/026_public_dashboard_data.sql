create or replace function get_public_dashboard_groups()
returns table (
  id uuid,
  name text,
  leader_member_id uuid,
  leader_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.leader_member_id,
    coalesce(l.name, '미배정') as leader_name
  from groups g
  left join members l on l.id = g.leader_member_id
  order by g.name;
$$;

create or replace function get_public_dashboard_members()
returns table (
  id uuid,
  name text,
  group_id uuid,
  group_name text,
  status member_status,
  custom_fields jsonb,
  is_merged_placeholder boolean,
  attendance_records jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.name,
    m.group_id,
    coalesce(g.name, '미배정') as group_name,
    m.status,
    jsonb_strip_nulls(
      jsonb_build_object(
        'english_name', m.custom_fields -> 'english_name',
        'gender', m.custom_fields -> 'gender',
        'birthdate', m.custom_fields -> 'birthdate',
        'age', m.custom_fields -> 'age',
        'job', m.custom_fields -> 'job',
        'ministries', m.custom_fields -> 'ministries',
        'ministry_1', m.custom_fields -> 'ministry_1',
        'ministry_2', m.custom_fields -> 'ministry_2'
      )
    ) as custom_fields,
    coalesce(m.email, '') ilike '%@merged.local' as is_merged_placeholder,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'event_id', ar.event_id,
          'status', ar.status
        )
      ) filter (where ar.id is not null),
      '[]'::jsonb
    ) as attendance_records
  from members m
  left join groups g on g.id = m.group_id
  left join attendance_records ar on ar.member_id = m.id
  group by m.id, g.name
  order by m.name;
$$;

revoke all on function get_public_dashboard_groups() from public;
revoke all on function get_public_dashboard_members() from public;
grant execute on function get_public_dashboard_groups() to authenticated;
grant execute on function get_public_dashboard_members() to authenticated;
