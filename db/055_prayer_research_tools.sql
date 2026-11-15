-- Apply after 054. A reserved paid continuation is never automatically retried.
-- Interrupted pending POSTs remain busy until workflow timeout; never reclaim them.
alter table public.prayer_generation_requests
  add column if not exists research_step_count integer not null default 0
    check (research_step_count between 0 and 8),
  add column if not exists research_pending_previous_id text,
  add column if not exists research_pending_started_at timestamptz,
  add column if not exists research_committed_previous_id text;

create or replace function public.reserve_prayer_research_step(p_id uuid, p_token text, p_previous_response_id text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if request.status not in ('queued','running') or request.api_trigger_id is distinct from 'responses_v1'
    or p_previous_response_id is null or p_previous_response_id !~ '^resp_[A-Za-z0-9_-]{1,160}$'
    or request.run_id is distinct from p_previous_response_id
    or request.research_pending_previous_id is not null then
    return false;
  end if;
  if request.research_step_count >= 8 then
    raise exception 'Prayer research continuation limit reached.' using errcode = 'P0002';
  end if;
  update public.prayer_generation_requests set
    research_pending_previous_id = p_previous_response_id,
    research_pending_started_at = clock_timestamp(),
    research_step_count = research_step_count + 1,
    updated_at = clock_timestamp()
    where id = request.id;
  return true;
end;
$$;
revoke all on function public.reserve_prayer_research_step(uuid,text,text) from public;
grant execute on function public.reserve_prayer_research_step(uuid,text,text) to anon, authenticated;

create or replace function public.commit_prayer_research_step(p_id uuid, p_token text, p_previous_response_id text, p_response_id text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if request.status not in ('queued','running') or request.api_trigger_id is distinct from 'responses_v1'
    or p_previous_response_id is null or p_previous_response_id !~ '^resp_[A-Za-z0-9_-]{1,160}$'
    or p_response_id is null or p_response_id !~ '^resp_[A-Za-z0-9_-]{1,160}$'
    or p_response_id = p_previous_response_id then return false; end if;
  -- Only the exact last committed pair can be acknowledged without a reservation.
  if request.research_pending_previous_id is null and request.run_id = p_response_id
    and request.research_committed_previous_id = p_previous_response_id then return true; end if;
  if request.run_id is distinct from p_previous_response_id
    or request.research_pending_previous_id is distinct from p_previous_response_id then return false; end if;
  update public.prayer_generation_requests set run_id = p_response_id,
    research_committed_previous_id = p_previous_response_id,
    research_pending_previous_id = null, research_pending_started_at = null,
    polled_at = null, updated_at = clock_timestamp()
    where id = request.id;
  return true;
end;
$$;
revoke all on function public.commit_prayer_research_step(uuid,text,text,text) from public;
grant execute on function public.commit_prayer_research_step(uuid,text,text,text) to anon, authenticated;

create or replace function public.claim_prayer_response_result(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if request.status not in ('queued','running') or request.api_trigger_id is distinct from 'responses_v1' then
    return jsonb_build_object('state','done');
  end if;
  if request.run_id is null or request.polled_at > clock_timestamp() - interval '45 seconds' then
    return jsonb_build_object('state','busy');
  end if;
  -- Do not renew the lease or release the reservation: the POST may have succeeded.
  -- A pending POST may still commit. Interrupted calls wait for workflow timeout.
  if request.research_pending_previous_id is not null then
    return jsonb_build_object('state','busy');
  end if;
  update public.prayer_generation_requests set polled_at = clock_timestamp() where id = request.id;
  return jsonb_build_object('state','claimed','run_id',request.run_id);
end;
$$;
revoke all on function public.claim_prayer_response_result(uuid,text) from public;
grant execute on function public.claim_prayer_response_result(uuid,text) to anon, authenticated;
