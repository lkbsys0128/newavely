-- Accounting only: never changes prayer content, permissions, or generation status.
create table if not exists public.prayer_api_usage (
  response_id text primary key check (response_id ~ '^resp_[A-Za-z0-9_-]{1,160}$'),
  request_id uuid not null references public.prayer_generation_requests(id) on delete cascade,
  stage text not null check (stage in ('research','vision')),
  model text not null check (model ~ '^[a-zA-Z0-9._-]{1,100}$'),
  input_tokens bigint check (input_tokens between 0 and 1000000000),
  cached_tokens bigint check (cached_tokens between 0 and input_tokens),
  output_tokens bigint check (output_tokens between 0 and 1000000000),
  search_calls integer not null check (search_calls between 0 and 1000000),
  estimated_usd numeric(16,8) check (estimated_usd between 0 and 1000000),
  pricing_version text not null check (pricing_version = '2026-11-14-standard'),
  created_at timestamptz not null default now()
);
create index if not exists prayer_api_usage_request_idx on public.prayer_api_usage(request_id);
alter table public.prayer_api_usage enable row level security;
revoke all on public.prayer_api_usage from public, anon, authenticated;

create or replace function public.record_prayer_api_usage(p_id uuid, p_token text, p_usage jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if request.api_trigger_id is distinct from 'responses_v1' or p_usage is null or jsonb_typeof(p_usage) <> 'object' then
    raise exception 'Invalid usage request';
  end if;
  if p_usage->>'stage' = 'research' and request.run_id is distinct from p_usage->>'response_id' then
    raise exception 'Usage response mismatch';
  end if;
  insert into public.prayer_api_usage(response_id, request_id, stage, model, input_tokens, cached_tokens,
    output_tokens, search_calls, estimated_usd, pricing_version)
  values (p_usage->>'response_id', request.id, p_usage->>'stage', p_usage->>'model',
    (p_usage->>'input_tokens')::bigint, (p_usage->>'cached_tokens')::bigint,
    (p_usage->>'output_tokens')::bigint, (p_usage->>'search_calls')::integer,
    (p_usage->>'estimated_usd')::numeric, p_usage->>'pricing_version')
  on conflict (response_id) do nothing;
end;
$$;
revoke all on function public.record_prayer_api_usage(uuid,text,jsonb) from public;
grant execute on function public.record_prayer_api_usage(uuid,text,jsonb) to anon, authenticated;

create or replace function public.get_prayer_api_usage()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare result jsonb;
begin
  if not exists(select 1 from public.members where auth_user_id = auth.uid()
    and status in ('active','care') and role in ('owner','admin')) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  with totals as (
    select r.id, r.event_date, r.status, r.created_at,
      count(u.response_id) as calls, count(*) filter (where u.stage = 'vision') as vision_calls,
      sum(u.input_tokens) as input_tokens, sum(u.cached_tokens) as cached_tokens,
      sum(u.output_tokens) as output_tokens, coalesce(sum(u.search_calls),0) as search_calls,
      sum(u.estimated_usd) as estimated_usd,
      count(*) filter (where u.response_id is not null and u.estimated_usd is null) as unpriced_calls
    from public.prayer_generation_requests r left join public.prayer_api_usage u on u.request_id = r.id
    where r.created_at >= now() - interval '30 days'
    group by r.id
  )
  select jsonb_build_object('estimated_usd',sum(estimated_usd),'calls',coalesce(sum(calls),0),
    'untracked_requests',count(*) filter (where calls = 0),
    'unpriced_calls',coalesce(sum(unpriced_calls),0),
    'rows',(select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc),'[]')
      from (select * from totals order by created_at desc limit 100) recent)) into result from totals;
  return result;
end;
$$;
revoke all on function public.get_prayer_api_usage() from public, anon;
grant execute on function public.get_prayer_api_usage() to authenticated;
