create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  description text,
  event_type text not null default 'event' check (event_type in ('event', 'meeting', 'notice')),
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table calendar_events enable row level security;

create index if not exists calendar_events_event_date_idx
on calendar_events(event_date, created_at);

drop policy if exists "authenticated users can read calendar events" on calendar_events;
create policy "authenticated users can read calendar events"
on calendar_events for select
to authenticated
using (true);

drop policy if exists "owners and admins can insert calendar events" on calendar_events;
create policy "owners and admins can insert calendar events"
on calendar_events for insert
to authenticated
with check (current_member_role() in ('owner', 'admin'));

drop policy if exists "owners and admins can update calendar events" on calendar_events;
create policy "owners and admins can update calendar events"
on calendar_events for update
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));

drop policy if exists "owners and admins can delete calendar events" on calendar_events;
create policy "owners and admins can delete calendar events"
on calendar_events for delete
to authenticated
using (current_member_role() in ('owner', 'admin'));
