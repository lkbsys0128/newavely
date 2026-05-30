-- Attendance history observability helpers.
-- Run after importing historical attendance rows.

create index if not exists attendance_events_date_title_idx
on attendance_events(event_date, title);

create index if not exists attendance_records_status_idx
on attendance_records(status);

create or replace view attendance_event_group_summary
with (security_invoker = true)
as
select
  ae.id as event_id,
  ae.event_date,
  ae.title,
  g.id as group_id,
  coalesce(g.name, '미배정') as group_name,
  count(ar.id) as total_records,
  count(*) filter (where ar.status = 'present') as present_count,
  count(*) filter (where ar.status = 'absent') as absent_count,
  count(*) filter (where ar.status = 'excused') as excused_count,
  round(
    count(*) filter (where ar.status = 'present')::numeric
    / nullif(count(ar.id), 0)
    * 100,
    2
  ) as attendance_rate
from attendance_events ae
join attendance_records ar on ar.event_id = ae.id
join members m on m.id = ar.member_id
left join groups g on g.id = m.group_id
group by ae.id, ae.event_date, ae.title, g.id, g.name;

create or replace view attendance_monthly_summary
with (security_invoker = true)
as
select
  date_trunc('month', ae.event_date)::date as month_start,
  ae.title,
  count(ar.id) as total_records,
  count(*) filter (where ar.status = 'present') as present_count,
  count(*) filter (where ar.status = 'absent') as absent_count,
  count(*) filter (where ar.status = 'excused') as excused_count,
  round(
    count(*) filter (where ar.status = 'present')::numeric
    / nullif(count(ar.id), 0)
    * 100,
    2
  ) as attendance_rate
from attendance_events ae
join attendance_records ar on ar.event_id = ae.id
join members m on m.id = ar.member_id
where m.status in ('active', 'care', 'new', 'inactive')
group by date_trunc('month', ae.event_date)::date, ae.title;

create or replace view attendance_member_yearly_summary
with (security_invoker = true)
as
select
  m.id as member_id,
  m.name as member_name,
  m.status as member_status,
  coalesce(g.name, '미배정') as group_name,
  extract(year from ae.event_date)::integer as attendance_year,
  count(ar.id) filter (where ae.title = '주일 예배') as worship_total,
  count(ar.id) filter (where ae.title = '주일 예배' and ar.status = 'present') as worship_present,
  round(
    count(ar.id) filter (where ae.title = '주일 예배' and ar.status = 'present')::numeric
    / nullif(count(ar.id) filter (where ae.title = '주일 예배'), 0)
    * 100,
    2
  ) as worship_rate,
  count(ar.id) filter (where ae.title = '순모임') as group_meeting_total,
  count(ar.id) filter (where ae.title = '순모임' and ar.status = 'present') as group_meeting_present,
  round(
    count(ar.id) filter (where ae.title = '순모임' and ar.status = 'present')::numeric
    / nullif(count(ar.id) filter (where ae.title = '순모임'), 0)
    * 100,
    2
  ) as group_meeting_rate
from members m
left join groups g on g.id = m.group_id
join attendance_records ar on ar.member_id = m.id
join attendance_events ae on ae.id = ar.event_id
where m.status in ('active', 'care', 'new', 'inactive')
group by m.id, m.name, m.status, g.name, extract(year from ae.event_date)::integer;

