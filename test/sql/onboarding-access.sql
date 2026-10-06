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
grant select, insert, update, delete on all tables in schema public to authenticated;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into members(id, auth_user_id, name, status) values
 ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Pending','new'),
 ('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','Registered','active');
insert into groups(name) values ('Private group');
insert into important_links(title,url) values ('Public link','https://example.com');
set local role authenticated;
select set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
do $$ declare changed integer; request_id uuid; begin
  if (select count(*) from members) <> 1 then raise exception 'Roster leak'; end if;
  if (select count(*) from groups) <> 0 then raise exception 'Group leak'; end if;
  if (select count(*) from important_links) <> 0 then raise exception 'Raw links leak'; end if;
  if (select count(*) from get_public_important_links()) <> 1 then raise exception 'Public links blocked'; end if;
  if (select count(*) from get_public_dashboard_members()) <> 0 then raise exception 'Dashboard RPC leak'; end if;
  if (select count(*) from get_public_dashboard_groups()) <> 0 then raise exception 'Group RPC leak'; end if;
  if (select count(*) from get_public_permission_role_counts()) <> 0 then raise exception 'Role RPC leak'; end if;
  update members set status='active' where auth_user_id=auth.uid();
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Self approval allowed'; end if;
  begin
    insert into member_status_messages(member_id,message) values(current_member_id(),'Blocked');
    raise exception 'Pending status write allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  insert into member_link_requests(requester_member_id,note) values(current_member_id(),'Please link me') returning id into request_id;
  perform record_audit_log('member_link_request.create','member_link_requests',request_id);
  if (select count(*) from member_link_requests) <> 1 then raise exception 'Own request unavailable'; end if;
  begin
    perform record_audit_log('member.update','members',current_member_id());
    raise exception 'Pending audit forgery allowed' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
end $$;
select set_config('test.uid','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  if (select count(*) from get_public_dashboard_members()) <> 2 then raise exception 'Registered stats changed'; end if;
  if (select count(*) from groups) <> 1 then raise exception 'Registered groups blocked'; end if;
end $$;
reset role;
rollback;
\echo 'Onboarding access integration tests passed'
