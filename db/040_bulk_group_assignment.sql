create or replace function public.bulk_assign_group_members(
  source_group_id uuid, target_group_id uuid, selected_member_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  source_leader uuid;
  expected_count integer;
  changed_count integer;
  before_rows jsonb;
begin
  if current_member_role() not in ('owner', 'admin') or current_member_role() is null then
    raise exception '관리자만 순을 일괄 배정할 수 있습니다.';
  end if;
  expected_count := cardinality(selected_member_ids);
  if expected_count is null or expected_count < 1 or expected_count > 500
     or exists (select 1 from unnest(selected_member_ids) id where id is null)
     or expected_count <> (select count(distinct id) from unnest(selected_member_ids) id) then
    raise exception '이동할 멤버를 올바르게 선택해주세요.';
  end if;
  if source_group_id = target_group_id then
    raise exception '다른 순을 선택해주세요.';
  end if;
  -- Lock both groups in a stable order before validating and moving members.
  perform id from groups where id in (source_group_id, target_group_id) order by id for update;
  select leader_member_id into source_leader from groups where id = source_group_id;
  if not found then raise exception '원본 순을 찾을 수 없습니다.'; end if;
  if target_group_id is not null and not exists (select 1 from groups where id = target_group_id) then
    raise exception '대상 순을 찾을 수 없습니다.';
  end if;
  perform id from members where id = any(selected_member_ids) order by id for update;
  select jsonb_agg(jsonb_build_object('id', id, 'group_id', group_id))
    into before_rows from members
    where id = any(selected_member_ids) and (group_id = source_group_id or id = source_leader);
  if coalesce(jsonb_array_length(before_rows), 0) <> expected_count then
    raise exception '순 명단이 변경되었습니다. 다시 열어 확인해주세요.';
  end if;
  update members set group_id = target_group_id, updated_at = now()
    where id = any(selected_member_ids) and (group_id = source_group_id or id = source_leader);
  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then
    raise exception '일부 멤버를 변경할 권한이 없습니다. 아무도 이동하지 않았습니다.';
  end if;
  if source_leader = any(selected_member_ids) then
    update groups set leader_member_id = null, updated_at = now() where id = source_group_id;
  end if;
  return jsonb_build_object('count', changed_count, 'before', before_rows, 'previous_leader_id', source_leader);
end;
$$;
revoke all on function public.bulk_assign_group_members(uuid, uuid, uuid[]) from public;
grant execute on function public.bulk_assign_group_members(uuid, uuid, uuid[]) to authenticated;
