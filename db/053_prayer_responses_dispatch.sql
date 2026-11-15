-- Apply after 052. At most one Responses POST per request, including uncertain network outcomes.
create or replace function public.reserve_prayer_response_dispatch(p_id uuid, p_token text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$'
    or request.token_hash is distinct from encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception '생성 요청 인증을 확인해주세요.';
  end if;
  if request.status not in ('queued','running') or request.expires_at <= clock_timestamp()
    or request.dispatched_at is not null then return false; end if;
  update public.prayer_generation_requests set api_trigger_id = 'responses_v1', dispatched_at = clock_timestamp(),
    updated_at = clock_timestamp() where id = p_id;
  return true;
end;
$$;
revoke all on function public.reserve_prayer_response_dispatch(uuid,text) from public, anon;
grant execute on function public.reserve_prayer_response_dispatch(uuid,text) to authenticated;

create or replace function public.mark_prayer_response_dispatched(p_id uuid, p_token text, p_response_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$'
    or request.token_hash is distinct from encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    or request.api_trigger_id is distinct from 'responses_v1' or request.dispatched_at is null
    or p_response_id is null or p_response_id !~ '^resp_[A-Za-z0-9_-]{1,160}$'
    or (request.run_id is not null and request.run_id <> p_response_id) then
    raise exception '생성 요청 접수 정보를 확인해주세요.';
  end if;
  update public.prayer_generation_requests set run_id = p_response_id, updated_at = clock_timestamp()
    where id = p_id returning * into request;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.mark_prayer_response_dispatched(uuid,text,text) from public, anon;
grant execute on function public.mark_prayer_response_dispatched(uuid,text,text) to authenticated;

create or replace function public.get_prayer_generation_task(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  return jsonb_build_object('id',request.id,'input',request.input,'status',request.status,
    'api_trigger_id',request.api_trigger_id,'created_at',request.created_at,'expires_at',request.expires_at);
end;
$$;
revoke all on function public.get_prayer_generation_task(uuid,text) from public;
grant execute on function public.get_prayer_generation_task(uuid,text) to anon, authenticated;
