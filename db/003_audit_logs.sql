create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_member_id uuid references members(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_member_idx on audit_logs(actor_member_id);
create index if not exists audit_logs_target_idx on audit_logs(target_table, target_id);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);

alter table audit_logs enable row level security;

create or replace function record_audit_log(
  p_action text,
  p_target_table text,
  p_target_id uuid,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  actor_id uuid;
begin
  select id into actor_id
  from members
  where auth_user_id = auth.uid()
  limit 1;

  insert into audit_logs (
    actor_member_id,
    actor_auth_user_id,
    action,
    target_table,
    target_id,
    before_data,
    after_data,
    metadata
  )
  values (
    actor_id,
    auth.uid(),
    p_action,
    p_target_table,
    p_target_id,
    p_before_data,
    p_after_data,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

grant execute on function record_audit_log(text, text, uuid, jsonb, jsonb, jsonb) to authenticated;

create policy "admins can read audit logs"
on audit_logs for select
to authenticated
using (current_member_role() = 'admin');
