-- Run only in an empty, disposable PostgreSQL database. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.members') is not null or to_regclass('public.prayer_meetings') is not null
    or to_regclass('public.prayer_generation_requests') is not null then
    raise exception 'Use an empty disposable database, never production.';
  end if;
end $$;
create role anon;
create role authenticated;
create schema auth;
-- Match the two JWT settings used by Supabase, including the newer claims JSON.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated;
create table members(id uuid primary key, auth_user_id uuid unique, status text, role text);
create function current_member_id() returns uuid language sql stable security definer set search_path=public as $$
  select id from members where auth_user_id=auth.uid()
$$;
create function current_member_status() returns text language sql stable security definer set search_path=public as $$
  select status from members where auth_user_id=auth.uid()
$$;
create function is_registered_member() returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and coalesce(current_member_status() in ('active','care'),false)
$$;
create table test_audit(action text, actor_member_id uuid, actor_auth_user_id uuid, target_id uuid, before_data jsonb, after_data jsonb, metadata jsonb);
create function record_audit_log(text,text,uuid,jsonb default null,jsonb default null,jsonb default '{}')
returns uuid language plpgsql security definer set search_path=public as $$ begin
  insert into test_audit values($1,current_member_id(),auth.uid(),$3,$4,$5,$6); return $3;
end $$;
insert into members values
  ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','active','member'),
  ('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','active','member'),
  ('33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','care','assistant'),
  ('44444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444','new','member'),
  ('55555555-5555-4555-8555-555555555555','55555555-5555-4555-8555-555555555555','inactive','owner');
\ir ../../db/041_prayer_meetings.sql
\ir ../../db/042_prayer_source_links.sql
\ir ../../db/044_prayer_registered_members.sql
\ir ../../db/046_prayer_templates.sql
\ir ../../db/047_prayer_bible_links.sql
\ir ../../db/048_prayer_multiple_links.sql
\ir ../../db/049_prayer_link_labels.sql
\ir ../../db/052_prayer_generation_requests.sql

create function test_assert(condition boolean, message text) returns void language plpgsql as $$ begin
  if condition is distinct from true then raise exception '%',message using errcode='XX000'; end if;
end $$;
create function test_expect_error(command text, codes text[] default array['P0001']) returns void language plpgsql as $$ begin
  begin execute command;
    raise exception 'Expected rejection: %',command using errcode='XX000';
  exception when others then if not (sqlstate=any(codes)) then raise; end if; end;
end $$;
create function test_token_hash(token text) returns text language sql immutable as $$ select encode(sha256(convert_to(token,'UTF8')),'hex') $$;
create function test_generation_input(event_date text) returns jsonb language sql immutable as $$
  select jsonb_build_object('eventDate',event_date,'beforeSongs',jsonb_build_array('목마른 사슴','그 사랑 얼마나'),
    'afterSongs',jsonb_build_array('내 이름 아시죠','주의 아름다움은 말로 다'))
$$;
create function test_generation_result(event_date text) returns jsonb language sql volatile as $$
  select jsonb_build_object('songs',(
    select jsonb_agg(jsonb_build_object('requestedTitle',title,'title',title,'artist','테스트 가수 '||position,
      'lyricsUrl','https://music.bugs.co.kr/track/'||position,'scoreImageUrl','https://example.com/score-'||position||'.png',
      'scoreSourceUrl','https://example.com/song-'||position,'scoreKey','C','lyricsVerified',true,'scoreImageVerified',true,
      'verifiedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by position)
    from jsonb_array_elements_text((test_generation_input(event_date)->'beforeSongs')||(test_generation_input(event_date)->'afterSongs')) with ordinality as songs(title,position)
  ),'devotional',jsonb_build_object('date',event_date,'title','검증된 말씀 제목','book',30,'chapter',1,'passage','아모스 1:9–15',
    'sourceUrl','https://www.duranno.com/qt/view/bible.asp?qtDate='||event_date,'verifiedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'notes',jsonb_build_array('검증한 자료만 사용했습니다.'))
$$;
create function test_generation_entries(event_date text) returns jsonb language plpgsql volatile as $$
declare result jsonb:=test_generation_result(event_date); entries jsonb:='[]'; i integer; song jsonb;
begin
  for i in 0..7 loop
    if i in (1,2,5,6) then
      song:=result->'songs'->(case when i<3 then i-1 else i-3 end);
      entries:=entries||jsonb_build_array(jsonb_build_object('title','찬양','detail',song->>'title','sourceUrl',song->>'lyricsUrl',
        'additionalSourceUrls',jsonb_build_array(song->>'scoreImageUrl'),'sourceLabels',jsonb_build_object(song->>'lyricsUrl','가사',song->>'scoreImageUrl','악보')));
    elsif i=4 then
      entries:=entries||jsonb_build_array(jsonb_build_object('title','묵상/나눔','detail',E'아모스 1:9–15\n생명의삶 — 검증된 말씀 제목',
        'sourceUrl','http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL=30&CN=1&CV=99'));
    else
      entries:=entries||jsonb_build_array(jsonb_build_object('title','기도','detail',
        case i when 0 then '시작기도' when 3 then E'릴레이 기도\n마무리 기도' else E'통성기도\n마무리 기도' end));
    end if;
  end loop;
  return entries;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","marker":"original"}',true);
-- An ordinary active member can delegate; retrying the identical request is free.
select test_assert(create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',test_generation_input('2026-11-07'),test_token_hash(repeat('a',43)))->>'status'='queued','Member request rejected');
select test_assert(create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',test_generation_input('2026-11-07'),test_token_hash(repeat('a',43)))->>'id'='aaaaaaaa-0000-4000-8000-000000000001','Idempotent retry changed ID');
select test_assert(jsonb_array_length(list_prayer_generation_requests())=1,'Retry duplicated request');
select test_assert(not (get_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001') ?| array['token_hash','requester_auth_user_id','member_id','api_trigger_id','run_id','conversation_url','result']),'Private request fields leaked');
select test_expect_error($cmd$select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',test_generation_input('2026-11-08'),test_token_hash(repeat('a',43)))$cmd$);
select test_expect_error($cmd$select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',test_generation_input('2026-11-07'),test_token_hash(repeat('b',43)))$cmd$);
select test_expect_error($cmd$select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000002',test_generation_input('2026-11-07'),test_token_hash(repeat('b',43)))$cmd$);
select test_expect_error($cmd$select create_prayer_generation_request(gen_random_uuid(),test_generation_input('2026-02-30'),test_token_hash(repeat('a',43)))$cmd$);
select test_expect_error($cmd$select create_prayer_generation_request(gen_random_uuid(),jsonb_set(test_generation_input('2026-11-08'),'{beforeSongs}','["one"]'),test_token_hash(repeat('a',43)))$cmd$);
select test_expect_error($cmd$select create_prayer_generation_request(gen_random_uuid(),test_generation_input('2026-11-08'),'short')$cmd$);
select test_expect_error($cmd$select * from prayer_generation_requests$cmd$,array['42501']);
select test_expect_error($cmd$update prayer_generation_requests set status='completed'$cmd$,array['42501']);
select test_expect_error($cmd$select lock_prayer_generation_callback('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43))$cmd$,array['42501']);

-- Another member cannot observe/cancel/adopt a request or race its fixed date.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","marker":"other"}',true);
select test_assert(get_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001') is null,'Cross-owner request leak');
select test_assert(list_prayer_generation_requests()='[]'::jsonb,'Cross-owner list leak');
select test_expect_error($cmd$select cancel_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001')$cmd$);
select test_expect_error($cmd$select claim_prayer_generation_poll('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43))$cmd$);
select test_expect_error($cmd$select mark_prayer_generation_dispatched('aaaaaaaa-0000-4000-8000-000000000001','agtch_test','apirun_test','https://chatgpt.com/c/test')$cmd$);
select test_expect_error($cmd$select create_prayer_generation_request('bbbbbbbb-0000-4000-8000-000000000001',test_generation_input('2026-11-07'),test_token_hash(repeat('b',43)))$cmd$);

-- The anonymous transport has no access without the request-specific capability.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select test_expect_error($cmd$select get_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001')$cmd$,array['42501']);
select test_expect_error($cmd$select create_prayer_generation_request(gen_random_uuid(),test_generation_input('2026-11-09'),test_token_hash(repeat('a',43)))$cmd$,array['42501']);
select test_expect_error($cmd$select get_prayer_generation_task('aaaaaaaa-0000-4000-8000-000000000001',repeat('b',43))$cmd$);
select test_expect_error($cmd$select report_prayer_generation_status('aaaaaaaa-0000-4000-8000-000000000001',repeat('b',43),'running','확인 중')$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('b',43),test_generation_entries('2026-11-07'),test_generation_result('2026-11-07'))$cmd$);
select test_assert(get_prayer_generation_task('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43))->'input'=test_generation_input('2026-11-07'),'Scoped task unavailable');
select test_assert(not (get_prayer_generation_task('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43)) ?| array['token_hash','member_id','requester_auth_user_id','result']),'Callback exposed unrelated fields');
select test_assert(report_prayer_generation_status('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),'running','찬양 자료 확인 중')->>'status'='running','Callback progress failed');
select test_expect_error($cmd$select report_prayer_generation_status('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),'completed','가짜 완료')$cmd$);

-- Reject wrong dates, reordered songs, unverified images, and devotional links.
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-08'),test_generation_result('2026-11-08'))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),jsonb_set(test_generation_result('2026-11-07'),'{songs,0,requestedTitle}','"다른 곡"'))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),jsonb_set(test_generation_result('2026-11-07'),'{songs,0,scoreImageVerified}','false'))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),jsonb_set(test_generation_entries('2026-11-07'),'{4,sourceUrl}','"https://www.duranno.com/qt/"'),test_generation_result('2026-11-07'))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),jsonb_set(test_generation_entries('2026-11-07'),'{4,additionalSourceUrls}','["https://www.fondant.kr/"]'),test_generation_result('2026-11-07'))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),jsonb_set(test_generation_entries('2026-11-07'),'{0,detail}','"시작기도 이전 담당자"'),test_generation_result('2026-11-07'))$cmd$);

-- A devotional page must never re-enter the published meeting as an image link.
do $$ declare result jsonb; entries jsonb; url text; bad_passage text; begin
  foreach url in array array['https://www.duranno.com/qt/view/bible.asp?qtDate=2026-11-07','https://cdn.FONDANT.kr:443/series/episode.png','https://media.CGNTV.net:444/episode.png'] loop
    result:=jsonb_set(test_generation_result('2026-11-07'),'{songs,0,scoreImageUrl}',to_jsonb(url));
    entries:=jsonb_set(test_generation_entries('2026-11-07'),'{1,additionalSourceUrls}',jsonb_build_array(url));
    entries:=jsonb_set(entries,'{1,sourceLabels}',jsonb_build_object('https://music.bugs.co.kr/track/1','가사',url,'악보'));
    begin
      perform complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),entries,result);
      raise exception 'Devotional URL was published as score image' using errcode='XX000';
    exception when sqlstate 'P0001' then null; end;
  end loop;
  foreach bad_passage in array array['아모스 1:9–10:5','아모스 1:15–9','나훔 1:9–15'] loop
    result:=jsonb_set(test_generation_result('2026-11-07'),'{devotional,passage}',to_jsonb(bad_passage));
    entries:=jsonb_set(test_generation_entries('2026-11-07'),'{4,detail}',to_jsonb(bad_passage||E'\n생명의삶 — 검증된 말씀 제목'));
    begin
      perform complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),entries,result);
      raise exception 'Invalid scripture range was accepted' using errcode='XX000';
    exception when sqlstate 'P0001' then null; end;
  end loop;
end $$;

-- Stale/future timestamps and capability echoes cannot be stored or published.
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),jsonb_set(test_generation_result('2026-11-07'),'{songs,0,verifiedAt}','"2001-01-01T00:00:00Z"'))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),jsonb_set(test_generation_result('2026-11-07'),'{devotional,verifiedAt}',to_jsonb(to_char((clock_timestamp()+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),jsonb_set(test_generation_result('2026-11-07'),'{songs,0,verifiedAt}','"2026-02-30T00:00:00Z"'))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),jsonb_set(test_generation_result('2026-11-07'),'{songs,0,artist}',to_jsonb(repeat('a',43))))$cmd$);
select test_expect_error($cmd$select report_prayer_generation_status('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),'running',repeat('a',43))$cmd$);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),jsonb_set(test_generation_result('2026-11-07'),'{notes}',jsonb_build_array(repeat('x',301))))$cmd$);

-- Provider bookkeeping and polling cannot change the original callback progress.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select test_assert(mark_prayer_generation_dispatched('aaaaaaaa-0000-4000-8000-000000000001','agtch_test','apirun_test','https://chatgpt.com/c/test')->>'status'='running','Late dispatch regressed progress');
select test_expect_error($cmd$select claim_prayer_generation_poll('aaaaaaaa-0000-4000-8000-000000000001',null)$cmd$);
select test_expect_error($cmd$select claim_prayer_generation_poll('aaaaaaaa-0000-4000-8000-000000000001',repeat('b',43))$cmd$);
select test_assert(claim_prayer_generation_poll('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43))->>'run_id'='apirun_test','First poll lease unavailable');
select test_assert(claim_prayer_generation_poll('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43)) is null,'Poll lease did not throttle');
select test_expect_error($cmd$select mark_prayer_generation_dispatched('aaaaaaaa-0000-4000-8000-000000000001','agtch_other','apirun_other','https://chatgpt.com/c/test')$cmd$);

-- A valid capability saves as its delegating member, then restores the caller.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","marker":"preserve"}',true);
select test_assert(complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),test_generation_entries('2026-11-07'),test_generation_result('2026-11-07'))->>'status'='completed','Valid result not saved');
select test_assert(auth.uid()='22222222-2222-4222-8222-222222222222'::uuid,'JWT subject not restored');
select test_assert(current_setting('request.jwt.claims')='{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","marker":"preserve"}','JWT claims not restored');
select test_assert(complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),'[]','{}')->>'status'='completed','Completed retry was not idempotent');
select test_assert(report_prayer_generation_status('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43),'failed','늦은 실패')->>'status'='completed','Callback changed completed job');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select test_assert(fail_prayer_generation_dispatch('aaaaaaaa-0000-4000-8000-000000000001','늦은 API 실패')->>'status'='completed','Provider failure changed completed job');
select test_assert(cancel_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001')->>'status'='completed','Cancel changed completed job');
select test_assert(claim_prayer_generation_poll('aaaaaaaa-0000-4000-8000-000000000001',repeat('a',43)) is null,'Completed request still polled');
select test_assert(get_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001')#>>'{result_summary,songs,0,title}'='목마른 사슴','Result summary missing');
select test_assert(not ((get_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000001')->'result_summary')::text like '%duranno%'),'Private research URL leaked in summary');
reset role;
select test_assert((select count(*) from prayer_meetings)=1,'Idempotent completion created duplicate meetings');
select test_assert((select count(*) from test_audit where action='prayer.create')=1,'Prayer audit duplicated');
select test_assert((select actor_auth_user_id from test_audit where action='prayer.create')='11111111-1111-4111-8111-111111111111'::uuid,'Prayer audit attributed to callback caller');
select test_assert((select actor_auth_user_id from test_audit where action='prayer_generation.complete')='11111111-1111-4111-8111-111111111111'::uuid,'Generation audit missing delegator');
select test_assert(not exists(select 1 from test_audit a where strpos(to_jsonb(a)::text,repeat('a',43))>0),'Capability leaked to audit');
select test_assert((select entries from prayer_meetings where event_date='2026-11-07')=test_generation_entries('2026-11-07'),'Saved order changed');

-- Registration may be revoked or relinked after enqueue and before callback.
set local role authenticated;
select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000002',test_generation_input('2026-11-08'),test_token_hash(repeat('b',43)));
reset role;
update members set status='inactive' where id='11111111-1111-4111-8111-111111111111';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000002',repeat('b',43),test_generation_entries('2026-11-08'),test_generation_result('2026-11-08'))$cmd$);
reset role;
update members set status='active',auth_user_id=null where id='11111111-1111-4111-8111-111111111111';
set local role anon;
select test_expect_error($cmd$select get_prayer_generation_task('aaaaaaaa-0000-4000-8000-000000000002',repeat('b',43))$cmd$);
reset role;
update members set auth_user_id='11111111-1111-4111-8111-111111111111' where id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select cancel_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000002');
set local role anon;
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000002',repeat('b',43),test_generation_entries('2026-11-08'),test_generation_result('2026-11-08'))$cmd$);

-- Expiration is enforced by callbacks and materialized by the member's next read.
set local role authenticated;
select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000003',test_generation_input('2026-11-09'),test_token_hash(repeat('c',43)));
reset role;
update prayer_generation_requests set expires_at=clock_timestamp()-interval '1 second' where id='aaaaaaaa-0000-4000-8000-000000000003';
set local role anon;
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000003',repeat('c',43),test_generation_entries('2026-11-09'),test_generation_result('2026-11-09'))$cmd$);
set local role authenticated;
select test_assert(get_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000003')->>'status'='failed','Expired request left running');

-- A manually created meeting wins a date conflict; the agent never overwrites it.
select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000004',test_generation_input('2026-11-10'),test_token_hash(repeat('d',43)));
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select save_prayer_meeting(null,0,'2026-11-10','[{"title":"기도","detail":"수동으로 작성한 기도회"}]');
set local role anon;
select test_assert(complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000004',repeat('d',43),test_generation_entries('2026-11-10'),test_generation_result('2026-11-10'))->>'status'='needs_input','Date conflict not surfaced');
reset role;
select test_assert((select entries->0->>'detail' from prayer_meetings where event_date='2026-11-10')='수동으로 작성한 기도회','Existing meeting overwritten');

-- Even a failure inside the existing save RPC restores caller identity and rolls back.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000005',test_generation_input('2026-11-11'),test_token_hash(repeat('e',43)));
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","marker":"error"}',true);
select test_expect_error($cmd$select complete_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000005',repeat('e',43),jsonb_set(test_generation_entries('2026-11-11'),'{4,sourceLabels}','{"http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL=30&CN=1&CV=99":true}'),test_generation_result('2026-11-11'))$cmd$);
select test_assert(auth.uid()='22222222-2222-4222-8222-222222222222'::uuid,'Error left requester identity installed');
select test_assert(current_setting('request.jwt.claims')='{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","marker":"error"}','Error lost original JWT claims');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select test_assert(get_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000005')->>'status'='queued','Failed save changed job');
select test_assert(report_prayer_generation_status('aaaaaaaa-0000-4000-8000-000000000005',repeat('e',43),'needs_input','동명곡 확인이 필요합니다.')->>'status'='needs_input','Needs-input status missing');
select test_assert(fail_prayer_generation_dispatch('aaaaaaaa-0000-4000-8000-000000000005','늦은 실패')->>'status'='needs_input','Late dispatch error hid needs-input');
reset role;
select test_assert(not exists(select 1 from prayer_meetings where event_date in ('2026-11-08','2026-11-09','2026-11-11')),'Failed/revoked/expired writes persisted');

-- Pending, inactive and unlinked users cannot enqueue or read generation jobs.
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select test_expect_error($cmd$select create_prayer_generation_request(gen_random_uuid(),test_generation_input('2026-12-01'),test_token_hash(repeat('p',43)))$cmd$);
select test_expect_error($cmd$select list_prayer_generation_requests()$cmd$);
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select test_expect_error($cmd$select create_prayer_generation_request(gen_random_uuid(),test_generation_input('2026-12-01'),test_token_hash(repeat('p',43)))$cmd$);
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select test_expect_error($cmd$select create_prayer_generation_request(gen_random_uuid(),test_generation_input('2026-12-01'),test_token_hash(repeat('p',43)))$cmd$);

-- Two in-flight requests and five admissions/hour are enforced independently.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select create_prayer_generation_request('bbbbbbbb-0000-4000-8000-000000000002',test_generation_input('2026-12-01'),test_token_hash(repeat('f',43)));
select create_prayer_generation_request('bbbbbbbb-0000-4000-8000-000000000003',test_generation_input('2026-12-02'),test_token_hash(repeat('g',43)));
select test_expect_error($cmd$select create_prayer_generation_request('bbbbbbbb-0000-4000-8000-000000000004',test_generation_input('2026-12-03'),test_token_hash(repeat('h',43)))$cmd$);
select cancel_prayer_generation_request('bbbbbbbb-0000-4000-8000-000000000002');
select cancel_prayer_generation_request('bbbbbbbb-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ declare i integer; id uuid; saved jsonb; begin
  for i in 1..5 loop
    id:=('cccccccc-0000-4000-8000-00000000000'||i)::uuid;
    saved:=create_prayer_generation_request(id,test_generation_input('2026-12-1'||i),test_token_hash(repeat('z',43)));
    if saved->>'status'<>'queued' then raise exception 'Care member could not create'; end if;
    perform cancel_prayer_generation_request(id);
  end loop;
end $$;
select test_expect_error($cmd$select create_prayer_generation_request('cccccccc-0000-4000-8000-000000000006',test_generation_input('2026-12-16'),test_token_hash(repeat('z',43)))$cmd$);
select test_assert(create_prayer_generation_request('cccccccc-0000-4000-8000-000000000001',test_generation_input('2026-12-11'),test_token_hash(repeat('z',43)))->>'status'='cancelled','Idempotent retry hit admission limit');

-- A stale pending request from another member cannot permanently reserve a date.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select create_prayer_generation_request('bbbbbbbb-0000-4000-8000-000000000005',test_generation_input('2026-12-20'),test_token_hash(repeat('j',43)));
reset role;
update prayer_generation_requests set expires_at=clock_timestamp()-interval '1 second' where id='bbbbbbbb-0000-4000-8000-000000000005';
update prayer_generation_requests set created_at=clock_timestamp()-interval '2 hours' where member_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select test_assert(create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000006',test_generation_input('2026-12-20'),test_token_hash(repeat('k',43)))->>'status'='queued','Expired foreign request blocked date');
select cancel_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000006');

-- Older active requests must remain visible and cancellable despite newer history.
select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000007',test_generation_input('2027-01-01'),test_token_hash(repeat('l',43)));
select create_prayer_generation_request('aaaaaaaa-0000-4000-8000-000000000008',test_generation_input('2027-01-02'),test_token_hash(repeat('m',43)));
reset role;
update prayer_generation_requests set created_at=clock_timestamp()-interval '6 hours',expires_at=clock_timestamp()+interval '18 hours'
  where id='aaaaaaaa-0000-4000-8000-000000000007';
update prayer_generation_requests set created_at=clock_timestamp()-interval '5 hours',expires_at=clock_timestamp()+interval '19 hours'
  where id='aaaaaaaa-0000-4000-8000-000000000008';
insert into prayer_generation_requests(id,member_id,requester_auth_user_id,event_date,input,token_hash,status,created_at)
select ('dddddddd-0000-4000-8000-00000000000'||i)::uuid,
  '11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',date '2027-02-01'+i,
  test_generation_input((date '2027-02-01'+i)::text),test_token_hash(repeat('n',43)),'failed',
  clock_timestamp()-interval '55 minutes'-(i-1)*interval '10 minutes'
from generate_series(1,5) as history(i);
set local role authenticated;
do $$ declare listed jsonb; begin
  listed:=list_prayer_generation_requests();
  perform test_assert(jsonb_array_length(listed)=5,'Request history limit changed');
  perform test_assert(listed->0->>'id'='aaaaaaaa-0000-4000-8000-000000000008','Newer active request hidden by terminal history');
  perform test_assert(listed->1->>'id'='aaaaaaaa-0000-4000-8000-000000000007','Older active request hidden by terminal history');
  perform test_assert(cancel_prayer_generation_request((listed->0->>'id')::uuid)->>'status'='cancelled','Visible active request could not be cancelled');
  perform test_assert(cancel_prayer_generation_request((listed->1->>'id')::uuid)->>'status'='cancelled','Older active request could not be cancelled');
end $$;

-- Existing public read boundaries remain intact: latest meeting only.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select test_assert(get_latest_prayer_meeting()->>'event_date'='2026-11-10','Public latest behavior changed');
select test_expect_error($cmd$select * from prayer_meetings$cmd$,array['42501']);
select test_expect_error($cmd$select save_prayer_meeting(null,0,'2026-12-31','[{"title":"기도","detail":""}]')$cmd$,array['42501']);
select test_assert(auth.uid() is null,'Anonymous identity polluted');
reset role;
select test_assert((select count(*) from prayer_meetings)=2,'Unexpected meeting write');
select test_assert((select count(*) from test_audit where action='prayer.create')=2,'Missing/duplicate successful-save audit');
rollback;
\echo 'Prayer generation capability, permissions, state and save integration tests passed'
