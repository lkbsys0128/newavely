create table if not exists member_link_requests (
  id uuid primary key default gen_random_uuid(),
  requester_member_id uuid not null references members(id) on delete cascade,
  target_member_id uuid not null references members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_member_id uuid references members(id) on delete set null,
  constraint member_link_requests_distinct_members check (requester_member_id <> target_member_id)
);

create unique index if not exists member_link_requests_one_pending_per_requester_idx
on member_link_requests(requester_member_id)
where status = 'pending';

create index if not exists member_link_requests_target_idx on member_link_requests(target_member_id);
create index if not exists member_link_requests_status_idx on member_link_requests(status);

alter table member_link_requests enable row level security;

drop policy if exists "users can read their own link requests" on member_link_requests;
create policy "users can read their own link requests"
on member_link_requests for select
to authenticated
using (
  requester_member_id in (select id from members where auth_user_id = auth.uid())
  or current_member_role() in ('owner', 'admin')
);

drop policy if exists "users can create their own link requests" on member_link_requests;
create policy "users can create their own link requests"
on member_link_requests for insert
to authenticated
with check (
  requester_member_id in (select id from members where auth_user_id = auth.uid())
);

drop policy if exists "admins can update link requests" on member_link_requests;
drop policy if exists "owners and admins can update link requests" on member_link_requests;
create policy "owners and admins can update link requests"
on member_link_requests for update
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));
