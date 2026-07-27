create table if not exists attendance_extra_counts (
  event_date date primary key,
  clergy_count integer not null default 0 check (clergy_count >= 0),
  team_leader_count integer not null default 0 check (team_leader_count >= 0),
  visitor_count integer not null default 0 check (visitor_count >= 0),
  new_family_count integer not null default 0 check (new_family_count >= 0),
  note text,
  updated_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table attendance_extra_counts enable row level security;

drop policy if exists "owners admins and welcome can read attendance extra counts" on attendance_extra_counts;
create policy "owners admins and welcome can read attendance extra counts"
on attendance_extra_counts for select
to authenticated
using (public.current_member_role() in ('owner', 'admin', 'welcome'));

drop policy if exists "owners admins and welcome can manage attendance extra counts" on attendance_extra_counts;
create policy "owners admins and welcome can manage attendance extra counts"
on attendance_extra_counts for all
to authenticated
using (public.current_member_role() in ('owner', 'admin', 'welcome'))
with check (public.current_member_role() in ('owner', 'admin', 'welcome'));

create index if not exists attendance_extra_counts_updated_at_idx
on attendance_extra_counts(updated_at desc);
