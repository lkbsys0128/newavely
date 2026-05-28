do $$
begin
  create type care_followup_status as enum ('needed', 'contacted', 'prayer', 'resolved');
exception
  when duplicate_object then null;
end $$;

create table if not exists care_followups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  assigned_to_member_id uuid references members(id) on delete set null,
  status care_followup_status not null default 'needed',
  note text not null,
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists care_followups_member_idx on care_followups(member_id);
create index if not exists care_followups_status_idx on care_followups(status);
create index if not exists care_followups_created_at_idx on care_followups(created_at desc);

alter table care_followups enable row level security;

drop policy if exists "admins and leaders can read care followups" on care_followups;
create policy "admins and leaders can read care followups"
on care_followups for select
to authenticated
using (can_manage_members());

drop policy if exists "admins and leaders can manage care followups" on care_followups;
create policy "admins and leaders can manage care followups"
on care_followups for all
to authenticated
using (can_manage_members())
with check (can_manage_members());
