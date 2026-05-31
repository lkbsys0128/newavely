create table if not exists deleted_auth_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  deleted_member_id uuid,
  deleted_member_name text,
  deleted_member_email text,
  deleted_by_member_id uuid references members(id) on delete set null,
  reason text not null default 'member.permanent_delete',
  restore_requested_at timestamptz,
  restore_request_note text,
  created_at timestamptz not null default now()
);

create index if not exists deleted_auth_users_created_at_idx on deleted_auth_users(created_at desc);
create index if not exists deleted_auth_users_deleted_member_id_idx on deleted_auth_users(deleted_member_id);

alter table deleted_auth_users enable row level security;

drop policy if exists "deleted auth users can read own block" on deleted_auth_users;
create policy "deleted auth users can read own block"
on deleted_auth_users for select
to authenticated
using (auth_user_id = auth.uid() or current_member_role() in ('owner', 'admin'));

drop policy if exists "authorized users can create deleted auth blocks" on deleted_auth_users;
create policy "authorized users can create deleted auth blocks"
on deleted_auth_users for insert
to authenticated
with check (current_member_role() in ('owner', 'admin', 'leader'));

drop policy if exists "owners and admins can remove deleted auth blocks" on deleted_auth_users;
create policy "owners and admins can remove deleted auth blocks"
on deleted_auth_users for delete
to authenticated
using (current_member_role() in ('owner', 'admin'));

drop policy if exists "deleted auth users can request restore" on deleted_auth_users;
create policy "deleted auth users can request restore"
on deleted_auth_users for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

insert into deleted_auth_users (
  auth_user_id,
  deleted_member_id,
  deleted_member_name,
  deleted_member_email,
  deleted_by_member_id,
  created_at,
  reason
)
select
  (metadata->>'deletedAuthUserId')::uuid,
  target_id,
  metadata->>'deletedMemberName',
  metadata->>'deletedMemberEmail',
  actor_member_id,
  created_at,
  'member.permanent_delete.backfill'
from audit_logs
where action = 'member.permanent_delete'
  and metadata ? 'deletedAuthUserId'
  and nullif(metadata->>'deletedAuthUserId', '') is not null
on conflict (auth_user_id) do nothing;
