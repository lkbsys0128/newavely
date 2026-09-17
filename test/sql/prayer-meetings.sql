-- Run only in an empty, disposable PostgreSQL database. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.members') is not null or to_regclass('public.prayer_meetings') is not null then
    raise exception 'Use an empty disposable database, never production.';
  end if;
end $$;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table members(id uuid primary key, auth_user_id uuid, status text, role text);
create function current_member_id() returns uuid language sql stable security definer as $$ select id from members where auth_user_id = auth.uid() $$;
create function current_member_status() returns text language sql stable security definer as $$ select status from members where auth_user_id = auth.uid() $$;
create table test_audit(action text);
create function record_audit_log(text,text,uuid,jsonb,jsonb,jsonb) returns uuid language plpgsql security definer as $$ begin insert into test_audit values($1); return $3; end $$;
insert into members values ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','active','member');
\ir ../../db/041_prayer_meetings.sql
set local role authenticated;
select set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
select save_prayer_meeting(null,0,'2026-09-09','[{"title":"Old prayer","detail":""}]');
select save_prayer_meeting(null,0,'2026-09-16','[{"title":"Opening prayer","detail":""}]');
do $$ declare event_id uuid; result jsonb; begin
  if (select count(*) from prayer_meetings) <> 2 then raise exception 'Member history unavailable'; end if;
  select id into event_id from prayer_meetings where event_date='2026-09-16';
  result := save_prayer_meeting(event_id,1,'2026-09-16','[{"title":"Updated prayer","detail":"song"}]');
  if result->>'version' <> '2' then raise exception 'Version not incremented'; end if;
  begin
    perform save_prayer_meeting(event_id,1,'2026-09-16','[{"title":"Stale","detail":""}]');
    raise exception 'stale save allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform save_prayer_meeting(null,0,'2026-09-16','[{"title":"Duplicate","detail":""}]');
    raise exception 'duplicate allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform save_prayer_meeting(null,0,'2026-09-17','[{"title":"","detail":""}]');
    raise exception 'invalid row allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
do $$ declare r text; begin
  foreach r in array array['owner','admin','leader','staff','assistant','welcome','member'] loop
    update members set role=r;
    perform save_prayer_meeting((select id from prayer_meetings where event_date='2026-09-09'),
      (select version from prayer_meetings where event_date='2026-09-09'),'2026-09-09','[{"title":"Role test","detail":""}]');
  end loop;
end $$;
update members set status='inactive';
set local role authenticated;
do $$ begin
  if (select count(*) from prayer_meetings) <> 0 then raise exception 'Inactive history leak'; end if;
  begin
    perform save_prayer_meeting(null,0,'2026-09-17','[{"title":"Blocked","detail":""}]');
    raise exception 'inactive write allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into prayer_meetings(event_date,entries) values('2026-09-18','[{"title":"Direct","detail":""}]');
    raise exception 'direct write allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('test.uid','',true);
do $$ declare latest jsonb; begin
  latest := get_latest_prayer_meeting();
  if latest->>'event_date' <> '2026-09-16' or latest->'entries'->0->>'title' <> 'Updated prayer' then raise exception 'Wrong public event'; end if;
  begin
    perform * from prayer_meetings;
    raise exception 'anonymous history leak' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform save_prayer_meeting(null,0,'2026-09-17','[{"title":"Anonymous","detail":""}]');
    raise exception 'anonymous write allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from prayer_meetings) <> 2 then raise exception 'Failed saves persisted'; end if;
  if (select count(*) from test_audit) <> 10 then raise exception 'Audit mismatch'; end if;
end $$;
rollback;
\echo 'Prayer SQL security and concurrency tests passed'
