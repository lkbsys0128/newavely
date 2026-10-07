-- Empty disposable PostgreSQL only. Never run on production.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.members') is not null then raise exception 'Use empty disposable database'; end if;
end $$;
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
\ir ../../db/schema.sql
\ir ../../db/003_audit_logs.sql
\ir ../../db/045_onboarding_access_boundary.sql
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into members(id, auth_user_id, name, status) values
 ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Pending','new'),
 ('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','Registered','active');
set local role authenticated;
select set_config('test.uid','22222222-2222-4222-8222-222222222222',true);
do $$ declare saved jsonb; template_id uuid; begin
  saved := save_prayer_template(null,0,'Weekly','[{"title":"기도","detail":"Opening"}]');
  template_id := (saved->>'id')::uuid;
  perform save_prayer_meeting(null,0,'2026-10-07',saved->'entries');
  saved := save_prayer_template(template_id,1,'Renamed','[{"title":"찬양","detail":""}]');
  if (saved->>'version')::int <> 2 then raise exception 'Version not incremented'; end if;
  begin
    perform save_prayer_template(template_id,1,'Stale','[{"title":"기도","detail":""}]');
    raise exception 'Stale save allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform delete_prayer_template(template_id,1);
    raise exception 'Stale delete allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into prayer_templates(name, entries) values ('Direct','[]');
    raise exception 'Direct write allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform delete_prayer_template(template_id,2);
  if (select entries->0->>'detail' from prayer_meetings limit 1) <> 'Opening' then raise exception 'Meeting mutated'; end if;
  perform save_prayer_template(null,0,'Private','[{"title":"기도","detail":""}]');
end $$;
select set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
do $$ begin
  if (select count(*) from prayer_templates) <> 0 then raise exception 'Pending read allowed'; end if;
  begin
    perform save_prayer_template(null,0,'Denied','[{"title":"기도","detail":""}]');
    raise exception 'Pending save allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform delete_prayer_template(gen_random_uuid(),1);
    raise exception 'Pending delete allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from prayer_templates;
    raise exception 'Anonymous read allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from audit_logs where action like 'prayer_template.%') <> 4 then raise exception 'Audit missing'; end if;
end $$;
rollback;
\echo 'Prayer template integration tests passed'
