alter table deleted_auth_users
  add column if not exists restore_requested_at timestamptz,
  add column if not exists restore_request_note text;

drop policy if exists "deleted auth users can request restore" on deleted_auth_users;
create policy "deleted auth users can request restore"
on deleted_auth_users for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

create index if not exists deleted_auth_users_restore_requested_at_idx
on deleted_auth_users(restore_requested_at desc)
where restore_requested_at is not null;
