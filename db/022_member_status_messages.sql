create table if not exists member_status_messages (
  member_id uuid primary key references members(id) on delete cascade,
  message text not null check (char_length(message) <= 80),
  updated_at timestamptz not null default now()
);

create index if not exists member_status_messages_updated_at_idx
on member_status_messages(updated_at desc);

alter table member_status_messages enable row level security;

drop policy if exists "authenticated users can read member status messages" on member_status_messages;
create policy "authenticated users can read member status messages"
on member_status_messages for select
to authenticated
using (true);

drop policy if exists "users can create their own member status message" on member_status_messages;
create policy "users can create their own member status message"
on member_status_messages for insert
to authenticated
with check (member_id = current_member_id());

drop policy if exists "users can update their own member status message" on member_status_messages;
create policy "users can update their own member status message"
on member_status_messages for update
to authenticated
using (member_id = current_member_id())
with check (member_id = current_member_id());

drop policy if exists "users can delete their own member status message" on member_status_messages;
create policy "users can delete their own member status message"
on member_status_messages for delete
to authenticated
using (member_id = current_member_id());
