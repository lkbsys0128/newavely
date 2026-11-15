-- Apply after 053. The app worker keeps the capability server-side; no AI callback is needed.
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
  update public.prayer_generation_requests set polled_at = clock_timestamp() where id = request.id;
  return jsonb_build_object('state','claimed','run_id',request.run_id);
end;
$$;
revoke all on function public.claim_prayer_response_result(uuid,text) from public;
grant execute on function public.claim_prayer_response_result(uuid,text) to anon, authenticated;
