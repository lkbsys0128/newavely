-- Apply after 051. A member delegates one new prayer meeting for one fixed date.
-- No service-role client or reusable member JWT is given to the agent. A callback
-- capability authorizes only its unexpired request; it cannot edit an old meeting.
create table if not exists public.prayer_generation_requests (
  id uuid primary key,
  member_id uuid references public.members(id) on delete set null,
  requester_auth_user_id uuid not null,
  event_date date not null,
  input jsonb not null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'needs_input', 'completed', 'failed', 'cancelled')),
  message text not null default '기도회 생성을 준비하고 있습니다.',
  result jsonb,
  meeting_id uuid references public.prayer_meetings(id),
  api_trigger_id text,
  run_id text,
  conversation_url text,
  dispatched_at timestamptz,
  polled_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or meeting_id is not null)
);
create index if not exists prayer_generation_member_created_idx
  on public.prayer_generation_requests(member_id, created_at desc, id desc);
create unique index if not exists prayer_generation_one_pending_date_idx
  on public.prayer_generation_requests(event_date) where status in ('queued', 'running');
alter table public.prayer_generation_requests enable row level security;
-- Even the requester reads a projection through RPCs, never the capability hash.
revoke all on public.prayer_generation_requests from public, anon, authenticated;

create or replace function public.prayer_generation_public(p_request public.prayer_generation_requests)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public
as $$
declare summary jsonb;
begin
  if p_request.result is not null then
    summary := jsonb_build_object(
      'songs', (select jsonb_agg(jsonb_build_object('title', song->'title', 'artist', song->'artist') order by position)
        from jsonb_array_elements(p_request.result->'songs') with ordinality as items(song, position)),
      'passage', p_request.result #> '{devotional,passage}',
      'devotionalTitle', p_request.result #> '{devotional,title}',
      'notes', p_request.result->'notes');
  end if;
  return jsonb_build_object(
    'id', p_request.id, 'event_date', p_request.event_date, 'input', p_request.input,
    'status', p_request.status, 'message', p_request.message, 'meeting_id', p_request.meeting_id,
    'result_summary', summary, 'created_at', p_request.created_at, 'updated_at', p_request.updated_at,
    'expires_at', p_request.expires_at, 'dispatched', p_request.dispatched_at is not null);
end;
$$;
revoke all on function public.prayer_generation_public(public.prayer_generation_requests) from public, anon, authenticated;

create or replace function public.require_prayer_generation_member()
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid;
begin
  -- The share lock also prevents registration/revocation from changing mid-save.
  select member.id into v_member_id from public.members as member
    where member.auth_user_id = auth.uid() and member.status in ('active', 'care') for share;
  if v_member_id is null then raise exception '멤버 등록 승인 후 기도회를 생성할 수 있습니다.'; end if;
  return v_member_id;
end;
$$;
revoke all on function public.require_prayer_generation_member() from public, anon, authenticated;

create or replace function public.expire_prayer_generation_requests(p_member_id uuid)
returns void language sql security definer set search_path = pg_catalog, public
as $$
  update public.prayer_generation_requests
    set status = 'failed', message = '요청 시간이 만료되었습니다. 새로 생성해주세요.', updated_at = clock_timestamp()
    where member_id = p_member_id and status in ('queued', 'running') and expires_at <= clock_timestamp();
$$;
revoke all on function public.expire_prayer_generation_requests(uuid) from public, anon, authenticated;

create or replace function public.lock_prayer_generation_callback(p_id uuid, p_token text)
returns public.prayer_generation_requests language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype; expected_hash text; v_member_id uuid;
begin
  if p_id is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  expected_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into request from public.prayer_generation_requests where id = p_id;
  if not found or request.token_hash is distinct from expected_hash or request.expires_at <= clock_timestamp() then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  -- Match BOTH identities captured at creation. A relinked/revoked member cannot
  -- retain delegated writes. Always lock the member before locking the request.
  select member.id into v_member_id from public.members as member
    where member.id = request.member_id and member.auth_user_id = request.requester_auth_user_id
      and member.status in ('active', 'care') for share;
  if v_member_id is null then raise exception '요청 인증을 확인해주세요.'; end if;
  select * into request from public.prayer_generation_requests where id = p_id for update;
  if not found or request.member_id is distinct from v_member_id
    or request.token_hash is distinct from expected_hash or request.expires_at <= clock_timestamp() then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  return request;
end;
$$;
revoke all on function public.lock_prayer_generation_callback(uuid, text) from public, anon, authenticated;

create or replace function public.valid_prayer_generation_result(p_input jsonb, p_entries jsonb, p_result jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public
as $$
declare song jsonb; entry jsonb; devotional jsonb; note jsonb; position integer; row_index integer;
  requested_title text; url_key text; bible_url text; verse_match text[]; end_chapter integer;
  book_names text[] := array['창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기','사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더','욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','에스겔','다니엘','호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기','마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서','갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서','베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록'];
begin
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_typeof(p_result) is distinct from 'object' then return false; end if;
  if jsonb_array_length(p_entries) <> 8 or octet_length(p_entries::text) > 60000
    or octet_length(p_result::text) > 65000
    or (p_result - array['songs','devotional','notes']) <> '{}'::jsonb
    or jsonb_typeof(p_result->'songs') is distinct from 'array'
    or jsonb_typeof(p_result->'devotional') is distinct from 'object'
    or jsonb_typeof(p_result->'notes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_result->'songs') <> 4 or jsonb_array_length(p_result->'notes') > 8 then return false; end if;
  if p_entries->0 <> jsonb_build_object('title','기도','detail','시작기도')
    or p_entries->3 <> jsonb_build_object('title','기도','detail',E'릴레이 기도\n마무리 기도')
    or p_entries->7 <> jsonb_build_object('title','기도','detail',E'통성기도\n마무리 기도') then return false; end if;
  for position in 0..3 loop
    song := p_result->'songs'->position;
    row_index := case when position < 2 then position + 1 else position + 3 end;
    entry := p_entries->row_index;
    requested_title := case when position < 2 then p_input->'beforeSongs'->>position else p_input->'afterSongs'->>(position - 2) end;
    if jsonb_typeof(song) is distinct from 'object' or jsonb_typeof(entry) is distinct from 'object' then return false; end if;
    if (song - array['requestedTitle','title','artist','lyricsUrl','scoreImageUrl','scoreSourceUrl','scoreKey','lyricsVerified','scoreImageVerified','verifiedAt']) <> '{}'::jsonb
      or song->>'requestedTitle' is distinct from requested_title
      or jsonb_typeof(song->'requestedTitle') is distinct from 'string'
      or jsonb_typeof(song->'title') is distinct from 'string'
      or char_length(btrim(song->>'title')) not between 1 and 120 or (song->>'title') ~ '[[:cntrl:]]'
      or jsonb_typeof(song->'artist') is distinct from 'string'
      or char_length(btrim(song->>'artist')) not between 1 and 120 or (song->>'artist') ~ '[[:cntrl:]]'
      or song->'lyricsVerified' is distinct from 'true'::jsonb
      or song->'scoreImageVerified' is distinct from 'true'::jsonb
      or jsonb_typeof(song->'verifiedAt') is distinct from 'string'
      or char_length(song->>'verifiedAt') > 64
      or (song->>'verifiedAt') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?Z$'
      or (song ? 'scoreKey' and (jsonb_typeof(song->'scoreKey') is distinct from 'string' or char_length(btrim(song->>'scoreKey')) not between 1 and 40 or (song->>'scoreKey') ~ '[[:cntrl:]]'))
      then return false; end if;
    foreach url_key in array array['lyricsUrl','scoreImageUrl','scoreSourceUrl'] loop
      if jsonb_typeof(song->url_key) is distinct from 'string' or char_length(song->>url_key) > 2000
        or (song->>url_key) !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' then return false; end if;
    end loop;
    if (song->>'lyricsUrl') !~ '^https://music[.]bugs[.]co[.]kr/track/[0-9]+/?$'
      or entry->>'title' is distinct from '찬양' or entry->>'detail' is distinct from song->>'title'
      or song->>'scoreImageUrl' = song->>'lyricsUrl' or song->>'scoreImageUrl' = song->>'scoreSourceUrl'
      or (song->>'scoreImageUrl') ~* '^https://([A-Za-z0-9-]+[.])*(duranno[.]com|fondant[.]kr|cgntv[.]net)([:/?#]|$)'
      or song->>'scoreImageUrl' = p_result#>>'{devotional,sourceUrl}'
      or (entry - array['title','detail','sourceUrl','additionalSourceUrls','sourceLabels']) <> '{}'::jsonb
      or entry->>'sourceUrl' is distinct from song->>'lyricsUrl'
      or entry->'additionalSourceUrls' is distinct from jsonb_build_array(song->>'scoreImageUrl')
      or entry->'sourceLabels' is distinct from jsonb_build_object(song->>'lyricsUrl','가사',song->>'scoreImageUrl','악보')
      then return false; end if;
  end loop;
  devotional := p_result->'devotional';
  if (devotional - array['date','title','book','chapter','passage','sourceUrl','verifiedAt']) <> '{}'::jsonb
    or devotional->>'date' is distinct from p_input->>'eventDate'
    or jsonb_typeof(devotional->'date') is distinct from 'string'
    or jsonb_typeof(devotional->'title') is distinct from 'string'
    or char_length(btrim(devotional->>'title')) not between 1 and 120 or (devotional->>'title') ~ '[[:cntrl:]]'
    or jsonb_typeof(devotional->'passage') is distinct from 'string'
    or char_length(btrim(devotional->>'passage')) not between 1 and 120 or (devotional->>'passage') ~ '[[:cntrl:]]'
    or jsonb_typeof(devotional->'book') is distinct from 'number' or (devotional->>'book') !~ '^[1-9][0-9]?$'
    or jsonb_typeof(devotional->'chapter') is distinct from 'number' or (devotional->>'chapter') !~ '^[1-9][0-9]{0,2}$'
    or jsonb_typeof(devotional->'sourceUrl') is distinct from 'string' or char_length(devotional->>'sourceUrl') > 2000
    or (devotional->>'sourceUrl') !~ '^https://(www[.])?(duranno[.]com|fondant[.]kr)([/?#][^[:space:]]*)?$'
    or jsonb_typeof(devotional->'verifiedAt') is distinct from 'string' or char_length(devotional->>'verifiedAt') > 64
    or (devotional->>'verifiedAt') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?Z$' then return false; end if;
  bible_url := 'http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL='
    || (devotional->>'book') || '&CN=' || (devotional->>'chapter') || '&CV=99';
  if not public.is_prayer_bible_link(bible_url) then return false; end if;
  verse_match := regexp_match(devotional->>'passage', '^' || book_names[(devotional->>'book')::integer]
    || ' ' || (devotional->>'chapter') || ':([1-9][0-9]{0,2})(?:[-–](?:([1-9][0-9]{0,2}):)?([1-9][0-9]{0,2}))?$');
  if verse_match is null then return false; end if;
  end_chapter := coalesce(verse_match[2]::integer,(devotional->>'chapter')::integer);
  if end_chapter < (devotional->>'chapter')::integer
    or not public.is_prayer_bible_link('http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL='
      ||(devotional->>'book')||'&CN='||end_chapter||'&CV=99')
    or (end_chapter = (devotional->>'chapter')::integer and coalesce(verse_match[3]::integer,verse_match[1]::integer) < verse_match[1]::integer)
    then return false; end if;
  entry := p_entries->4;
  if not public.is_prayer_bible_link(bible_url) or jsonb_typeof(entry) is distinct from 'object'
    or (entry - array['title','detail','sourceUrl','additionalSourceUrls','sourceLabels']) <> '{}'::jsonb
    or entry->>'title' is distinct from '묵상/나눔'
    or entry->>'detail' is distinct from (devotional->>'passage') || E'\n생명의삶 — ' || (devotional->>'title')
    or entry->>'sourceUrl' is distinct from bible_url
    or (entry ? 'additionalSourceUrls' and entry->'additionalSourceUrls' <> '[]'::jsonb) then return false; end if;
  for note in select * from jsonb_array_elements(p_result->'notes') loop
    if jsonb_typeof(note) is distinct from 'string' or char_length(btrim(note #>> '{}')) not between 1 and 300 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_prayer_generation_result(jsonb, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.create_prayer_generation_request(p_id uuid, p_input jsonb, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype; v_event_date date; song jsonb;
begin
  v_member_id := public.require_prayer_generation_member();
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception '생성 요청을 확인해주세요.'; end if;
  if (p_input - array['eventDate','beforeSongs','afterSongs']) <> '{}'::jsonb
    or jsonb_typeof(p_input->'eventDate') is distinct from 'string' or (p_input->>'eventDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(p_input->'beforeSongs') is distinct from 'array'
    or jsonb_typeof(p_input->'afterSongs') is distinct from 'array' then raise exception '날짜와 찬양을 확인해주세요.'; end if;
  if jsonb_array_length(p_input->'beforeSongs') <> 2 or jsonb_array_length(p_input->'afterSongs') <> 2 then
    raise exception '말씀 전후 찬양을 각각 두 곡씩 입력해주세요.';
  end if;
  begin v_event_date := (p_input->>'eventDate')::date;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception '올바른 날짜를 선택해주세요.'; end;
  for song in select * from jsonb_array_elements((p_input->'beforeSongs') || (p_input->'afterSongs')) loop
    if jsonb_typeof(song) is distinct from 'string' or char_length(btrim(song #>> '{}')) not between 1 and 120
      or (song #>> '{}') <> btrim(song #>> '{}') or (song #>> '{}') ~ '[[:cntrl:]]' then
      raise exception '찬양 제목을 120자 이내로 입력해주세요.';
    end if;
  end loop;
  -- Serialize a member's admissions so simultaneous requests cannot evade limits.
  perform pg_advisory_xact_lock(hashtext('newavely.prayer_generation'), hashtext(v_member_id::text));
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests where id = p_id;
  if found then
    if request.member_id is distinct from v_member_id or request.requester_auth_user_id is distinct from auth.uid()
      or request.input is distinct from p_input or request.token_hash is distinct from p_token_hash then
      raise exception '같은 요청 번호의 입력이 다릅니다. 새로 요청해주세요.';
    end if;
    return public.prayer_generation_public(request);
  end if;
  if exists (select 1 from public.prayer_meetings as meeting where meeting.event_date = v_event_date) then
    raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 확인해주세요.';
  end if;
  update public.prayer_generation_requests as expired
    set status = 'failed', message = '요청 시간이 만료되었습니다. 새로 생성해주세요.', updated_at = clock_timestamp()
    where expired.event_date = v_event_date and expired.status in ('queued','running')
      and expired.expires_at <= clock_timestamp();
  if (select count(*) from public.prayer_generation_requests as recent
    where recent.member_id = v_member_id and recent.created_at >= clock_timestamp() - interval '1 hour') >= 5 then
    raise exception '기도회 자동 생성은 한 시간에 다섯 번까지 요청할 수 있습니다.';
  end if;
  if (select count(*) from public.prayer_generation_requests as pending
    where pending.member_id = v_member_id and pending.status in ('queued','running')) >= 2 then
    raise exception '진행 중인 생성 요청을 마치거나 취소한 뒤 다시 요청해주세요.';
  end if;
  insert into public.prayer_generation_requests(id, member_id, requester_auth_user_id, event_date, input, token_hash)
    values(p_id, v_member_id, auth.uid(), v_event_date, p_input, p_token_hash) returning * into request;
  perform public.record_audit_log('prayer_generation.create', 'prayer_generation_requests', request.id, null,
    jsonb_build_object('event_date',request.event_date,'input',request.input,'status',request.status), '{}'::jsonb);
  return public.prayer_generation_public(request);
exception when unique_violation then
  raise exception '해당 날짜의 생성 요청이 이미 진행 중입니다. 잠시 후 기도회를 확인해주세요.';
end;
$$;
revoke all on function public.create_prayer_generation_request(uuid, jsonb, text) from public, anon;
grant execute on function public.create_prayer_generation_request(uuid, jsonb, text) to authenticated;

create or replace function public.get_prayer_generation_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid();
  if not found then return null; end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.get_prayer_generation_request(uuid) from public, anon;
grant execute on function public.get_prayer_generation_request(uuid) to authenticated;

create or replace function public.list_prayer_generation_requests()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype; results jsonb := '[]'::jsonb;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  for request in select * from public.prayer_generation_requests as own
    where own.member_id = v_member_id and own.requester_auth_user_id = auth.uid()
    order by (own.status in ('queued','running')) desc, own.created_at desc, own.id desc limit 5 loop
    results := results || jsonb_build_array(public.prayer_generation_public(request));
  end loop;
  return results;
end;
$$;
revoke all on function public.list_prayer_generation_requests() from public, anon;
grant execute on function public.list_prayer_generation_requests() to authenticated;

create or replace function public.mark_prayer_generation_dispatched(p_id uuid, p_api_trigger_id text, p_run_id text default null, p_conversation_url text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  if p_api_trigger_id is null or p_api_trigger_id !~ '^agtch_[A-Za-z0-9_-]{1,160}$'
    or (p_run_id is not null and p_run_id !~ '^apirun_[A-Za-z0-9_-]{1,160}$')
    or (p_conversation_url is not null and (char_length(p_conversation_url) > 2000 or p_conversation_url !~ '^https://chatgpt[.]com/[^[:space:]]+$')) then
    raise exception '에이전트 접수 정보를 확인해주세요.';
  end if;
  if (request.api_trigger_id is not null and request.api_trigger_id <> p_api_trigger_id)
    or (request.run_id is not null and request.run_id is distinct from p_run_id) then
    raise exception '이미 접수된 요청의 실행 정보를 바꿀 수 없습니다.';
  end if;
  update public.prayer_generation_requests set api_trigger_id = p_api_trigger_id, run_id = p_run_id,
    conversation_url = p_conversation_url, dispatched_at = coalesce(dispatched_at,clock_timestamp()), updated_at = clock_timestamp(),
    message = case when status = 'queued' then '생성 요청을 접수했습니다. 찬양과 말씀 자료를 확인하고 있습니다.' else message end
    where id = request.id returning * into request;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.mark_prayer_generation_dispatched(uuid, text, text, text) from public, anon;
grant execute on function public.mark_prayer_generation_dispatched(uuid, text, text, text) to authenticated;

create or replace function public.fail_prayer_generation_dispatch(p_id uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 500 then raise exception '처리 결과를 확인해주세요.'; end if;
  if request.status in ('queued','running') then
    update public.prayer_generation_requests set status = 'failed', message = btrim(p_message), updated_at = clock_timestamp()
      where id = request.id returning * into request;
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.fail_prayer_generation_dispatch(uuid, text) from public, anon;
grant execute on function public.fail_prayer_generation_dispatch(uuid, text) to authenticated;

create or replace function public.cancel_prayer_generation_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  if request.status in ('queued','running') then
    update public.prayer_generation_requests set status = 'cancelled', message = '생성 요청을 취소했습니다.', updated_at = clock_timestamp()
      where id = request.id returning * into request;
    perform public.record_audit_log('prayer_generation.cancel', 'prayer_generation_requests', request.id,
      null, jsonb_build_object('status','cancelled'), '{}'::jsonb);
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.cancel_prayer_generation_request(uuid) from public, anon;
grant execute on function public.cancel_prayer_generation_request(uuid) to authenticated;

create or replace function public.claim_prayer_generation_poll(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member_id uuid; request public.prayer_generation_requests%rowtype;
begin
  v_member_id := public.require_prayer_generation_member();
  perform public.expire_prayer_generation_requests(v_member_id);
  select * into request from public.prayer_generation_requests as own
    where own.id = p_id and own.member_id = v_member_id and own.requester_auth_user_id = auth.uid() for update;
  if not found then raise exception '생성 요청을 찾을 수 없습니다.'; end if;
  -- Only the app server knows the capability for an app-created request.
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$'
    or request.token_hash is distinct from encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception '요청 인증을 확인해주세요.';
  end if;
  if request.status not in ('queued','running') or request.run_id is null or request.api_trigger_id is null
    or request.polled_at > clock_timestamp() - interval '15 seconds' then return null; end if;
  update public.prayer_generation_requests set polled_at = clock_timestamp() where id = request.id;
  return jsonb_build_object('api_trigger_id',request.api_trigger_id,'run_id',request.run_id);
end;
$$;
revoke all on function public.claim_prayer_generation_poll(uuid, text) from public, anon;
grant execute on function public.claim_prayer_generation_poll(uuid, text) to authenticated;

create or replace function public.get_prayer_generation_task(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  return jsonb_build_object('id',request.id,'input',request.input,'status',request.status,
    'created_at',request.created_at,'expires_at',request.expires_at);
end;
$$;
revoke all on function public.get_prayer_generation_task(uuid, text) from public;
grant execute on function public.get_prayer_generation_task(uuid, text) to anon, authenticated;

create or replace function public.report_prayer_generation_status(p_id uuid, p_token text, p_status text, p_message text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if p_status is null or p_status not in ('running','needs_input','failed')
    or p_message is null or char_length(btrim(p_message)) not between 1 and 300
    or strpos(p_message,p_token) > 0 then raise exception '처리 상태를 확인해주세요.'; end if;
  if request.status in ('queued','running') then
    update public.prayer_generation_requests set status = p_status, message = btrim(p_message), updated_at = clock_timestamp()
      where id = request.id returning * into request;
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.report_prayer_generation_status(uuid, text, text, text) from public;
grant execute on function public.report_prayer_generation_status(uuid, text, text, text) to anon, authenticated;

create or replace function public.complete_prayer_generation_request(p_id uuid, p_token text, p_entries jsonb, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype; saved jsonb;
  prior_sub text; prior_claims text; date_conflict boolean := false; checked jsonb; verified_at timestamptz;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if request.status = 'completed' then return public.prayer_generation_public(request); end if;
  if request.status not in ('queued','running') then raise exception '종료된 생성 요청입니다. 새로 요청해주세요.'; end if;
  if strpos(p_entries::text,p_token) > 0 or strpos(p_result::text,p_token) > 0
    or not public.valid_prayer_generation_result(request.input, p_entries, p_result) then
    raise exception '찬양, 악보, 말씀의 확인 결과를 다시 확인해주세요.';
  end if;
  for checked in select * from jsonb_array_elements((p_result->'songs') || jsonb_build_array(p_result->'devotional')) loop
    begin verified_at := (checked->>'verifiedAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception '자료를 이번 요청에서 다시 확인해주세요.';
    end;
    if verified_at > clock_timestamp() + interval '5 minutes'
      or verified_at < greatest(request.created_at - interval '5 minutes', clock_timestamp() - interval '24 hours') then
      raise exception '자료를 이번 요청에서 다시 확인해주세요.';
    end if;
  end loop;
  if exists (select 1 from public.prayer_meetings where event_date = request.event_date) then
    date_conflict := true;
  else
    -- The capability has already been checked and its original member is locked.
    -- Delegate only this new, fixed-date save to the existing validation/audit RPC.
    -- No caller-supplied identity, meeting ID, version or event date is accepted.
    prior_sub := current_setting('request.jwt.claim.sub', true);
    prior_claims := current_setting('request.jwt.claims', true);
    begin
      perform set_config('request.jwt.claim.sub', request.requester_auth_user_id::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub',request.requester_auth_user_id,'role','authenticated')::text, true);
      saved := public.save_prayer_meeting(null, 0, request.event_date, p_entries);
      perform public.record_audit_log('prayer_generation.complete','prayer_generation_requests',request.id,
        null,jsonb_build_object('meeting_id',saved->'id','status','completed'),jsonb_build_object('source','workspace_agent'));
      perform set_config('request.jwt.claim.sub', coalesce(prior_sub,''), true);
      perform set_config('request.jwt.claims', coalesce(prior_claims,''), true);
    exception when others then
      perform set_config('request.jwt.claim.sub', coalesce(prior_sub,''), true);
      perform set_config('request.jwt.claims', coalesce(prior_claims,''), true);
      -- A manual save may win the date uniqueness race after the first check.
      -- Preserve that meeting and expose a conflict; all other save errors escape.
      if sqlstate = 'P0001' and exists (select 1 from public.prayer_meetings where event_date = request.event_date) then
        date_conflict := true;
      else raise; end if;
    end;
  end if;
  if date_conflict then
    update public.prayer_generation_requests set status = 'needs_input',
      message = '해당 날짜의 기도회가 이미 만들어졌습니다. 기존 기도회를 확인해주세요.', updated_at = clock_timestamp()
      where id = request.id returning * into request;
  else
    update public.prayer_generation_requests set status = 'completed', message = '기도회를 생성하고 저장했습니다.',
      meeting_id = (saved->>'id')::uuid, result = p_result, updated_at = clock_timestamp()
      where id = request.id returning * into request;
  end if;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.complete_prayer_generation_request(uuid, text, jsonb, jsonb) from public;
grant execute on function public.complete_prayer_generation_request(uuid, text, jsonb, jsonb) to anon, authenticated;
