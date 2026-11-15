-- Shared Seattle calendar-month admission budget. Reservations are deliberately
-- retained after failure/cancellation because provider charges may arrive later.
alter table public.prayer_generation_requests
  add column if not exists budget_reserved_usd numeric(16,8) not null default 0;

create or replace function public.prayer_budget_committed()
returns numeric language sql volatile security definer set search_path = pg_catalog, public
as $$
  select coalesce(sum(greatest(r.budget_reserved_usd,
    coalesce(u.cost, case when r.run_id is not null then 1 else 0 end),
    case when u.unpriced then 5 else 0 end)),0)
  from public.prayer_generation_requests r
  left join lateral (select sum(estimated_usd) cost,
    bool_or(estimated_usd is null) unpriced from public.prayer_api_usage where request_id = r.id) u on true
  where r.created_at >= (date_trunc('month',now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles');
$$;
revoke all on function public.prayer_budget_committed() from public, anon, authenticated;

create or replace function public.reserve_prayer_monthly_budget()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare reservation numeric;
begin
  perform pg_advisory_xact_lock(hashtext('newavely.prayer.monthly-budget'));
  reservation := 0.5 + 0.125 * (jsonb_array_length(new.input->'beforeSongs') + jsonb_array_length(new.input->'afterSongs'));
  if reservation is null or reservation < 0.625 or reservation > 1.5 then
    raise exception 'Invalid prayer budget request';
  end if;
  if public.prayer_budget_committed() + reservation > 5 then
    raise exception '이번 달 AI 생성 한도가 부족합니다. 추가 생성이 필요하면 관리자에게 연락해주세요. 직접 작성은 계속 사용할 수 있습니다.';
  end if;
  new.budget_reserved_usd := reservation;
  return new;
end;
$$;
revoke all on function public.reserve_prayer_monthly_budget() from public, anon, authenticated;
drop trigger if exists prayer_monthly_budget on public.prayer_generation_requests;
create trigger prayer_monthly_budget before insert on public.prayer_generation_requests
for each row execute function public.reserve_prayer_monthly_budget();

create or replace function public.get_prayer_generation_budget(p_song_count integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare committed numeric; reservation numeric;
begin
  perform public.require_prayer_generation_member();
  if p_song_count is null or p_song_count not between 1 and 8 then raise exception 'Invalid song count'; end if;
  committed := public.prayer_budget_committed();
  reservation := 0.5 + 0.125 * p_song_count;
  return jsonb_build_object('usedPercent',least(100,ceil(committed / 5 * 100)),
    'estimatedPercent',ceil((0.2 + 0.1 * p_song_count) / 5 * 100),
    'reservedPercent',ceil(reservation / 5 * 100),
    'canGenerate',committed + reservation <= 5,
    'resetsOn',to_char(date_trunc('month',now() at time zone 'America/Los_Angeles') + interval '1 month','YYYY-MM-DD'));
end;
$$;
revoke all on function public.get_prayer_generation_budget(integer) from public, anon;
grant execute on function public.get_prayer_generation_budget(integer) to authenticated;
