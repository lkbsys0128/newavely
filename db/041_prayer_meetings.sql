create table if not exists public.prayer_meetings (
  id uuid primary key default gen_random_uuid(),
  event_date date not null unique,
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) between 1 and 100),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prayer_meetings_created_idx on public.prayer_meetings(created_at desc, id desc);
alter table public.prayer_meetings enable row level security;
revoke all on public.prayer_meetings from anon, authenticated;
grant select on public.prayer_meetings to authenticated;
drop policy if exists "active members read prayer history" on public.prayer_meetings;
create policy "active members read prayer history" on public.prayer_meetings for select to authenticated
using (current_member_id() is not null and current_member_status() <> 'inactive');

-- Anonymous callers cannot address a row or page through historical events.
create or replace function public.get_latest_prayer_meeting()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('id', id, 'event_date', event_date, 'entries', entries,
    'version', version, 'created_at', created_at, 'updated_at', updated_at)
  from prayer_meetings order by event_date desc limit 1;
$$;
revoke all on function public.get_latest_prayer_meeting() from public;
grant execute on function public.get_latest_prayer_meeting() to anon, authenticated;

-- All writes go through version-checked, audited saves; no direct table writes.
create or replace function public.save_prayer_meeting(p_id uuid, p_version integer, p_event_date date, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior prayer_meetings%rowtype;
  saved prayer_meetings%rowtype;
  entry jsonb;
begin
  if auth.uid() is null or current_member_id() is null or current_member_status() = 'inactive' then
    raise exception '로그인한 활성 멤버만 수정할 수 있습니다.';
  end if;
  if p_event_date is null or p_version is null or p_version < 0 then
    raise exception '날짜와 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '올바른 순서를 입력해주세요.';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
       or char_length(btrim(entry->>'title')) not between 1 and 120
       or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
       or (entry - 'title' - 'detail') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 기도회 버전이 올바르지 않습니다.'; end if;
    insert into prayer_meetings(event_date, entries) values(p_event_date, p_entries) returning * into saved;
  else
    select * into prior from prayer_meetings where id = p_id for update;
    if not found then raise exception '기도회를 찾을 수 없습니다.'; end if;
    if prior.version <> p_version then
      raise exception '다른 멤버가 먼저 수정했습니다. 작성 내용을 보관한 뒤 최신 순서를 다시 열어주세요.';
    end if;
    update prayer_meetings set event_date = p_event_date, entries = p_entries,
      version = version + 1, updated_at = now() where id = p_id returning * into saved;
  end if;
  perform record_audit_log(
    case when p_id is null then 'prayer.create' else 'prayer.update' end,
    'prayer_meetings', saved.id,
    case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved), '{}'::jsonb);
  return to_jsonb(saved);
exception when unique_violation then
  raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 수정해주세요.';
end;
$$;
revoke all on function public.save_prayer_meeting(uuid, integer, date, jsonb) from public;
grant execute on function public.save_prayer_meeting(uuid, integer, date, jsonb) to authenticated;
