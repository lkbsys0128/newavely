-- Backfill the combined attendance date model for 2026-05-31.
-- This keeps existing attendance records intact and only ensures that both
-- expected event types exist for the date.

insert into attendance_events (event_date, title)
select '2026-05-31'::date, expected.title
from (values ('주일 예배'), ('순모임')) as expected(title)
where not exists (
  select 1
  from attendance_events existing
  where existing.event_date = '2026-05-31'::date
    and existing.title = expected.title
);
