create table if not exists admin_feedback_messages (
  id uuid primary key default gen_random_uuid(),
  reporter_member_id uuid not null references members(id) on delete cascade,
  category text not null default 'other' check (category in ('feature', 'bug', 'question', 'other')),
  title text not null check (char_length(title) <= 80),
  message text not null check (char_length(message) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  admin_note text,
  resolved_by_member_id uuid references members(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_feedback_messages_status_idx
on admin_feedback_messages(status, created_at desc);

create index if not exists admin_feedback_messages_reporter_idx
on admin_feedback_messages(reporter_member_id, created_at desc);

alter table admin_feedback_messages enable row level security;

drop policy if exists "users can read own feedback messages" on admin_feedback_messages;
create policy "users can read own feedback messages"
on admin_feedback_messages for select
to authenticated
using (
  reporter_member_id = current_member_id()
  or current_member_role() in ('owner', 'admin')
);

drop policy if exists "users can create own feedback messages" on admin_feedback_messages;
create policy "users can create own feedback messages"
on admin_feedback_messages for insert
to authenticated
with check (reporter_member_id = current_member_id());

drop policy if exists "owners and admins can update feedback messages" on admin_feedback_messages;
create policy "owners and admins can update feedback messages"
on admin_feedback_messages for update
to authenticated
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));
