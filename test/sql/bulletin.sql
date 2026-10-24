-- Empty disposable database only, never production. All changes roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin if to_regclass('public.members') is not null then raise exception 'Use empty disposable DB'; end if; end $$;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
create function current_member_status() returns text language sql stable as $$ select current_setting('test.status',true) $$;
create function current_member_role() returns text language sql stable as $$ select current_setting('test.role',true) $$;
create table test_audit(action text);
create function record_audit_log(text,text,uuid,jsonb,jsonb) returns uuid language plpgsql security definer as $$ begin insert into test_audit values($1); return $3; end $$;
\ir storage-fixture.sql
\ir ../../db/050_public_bulletin.sql
set local role authenticated;
select set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
select set_config('test.status','active',true);
select set_config('test.role','admin',true);
insert into storage.objects(bucket_id,name) values ('bulletins','11111111-1111-4111-8111-111111111111.jpg'),('bulletins','22222222-2222-4222-8222-222222222222.png');
select publish_bulletin('Weekly','2026-10-18','11111111-1111-4111-8111-111111111111.jpg',0);
reset role;
\ir ../../db/051_bulletin_history.sql
set local role authenticated;
do $$ begin
  if jsonb_array_length(get_bulletin_history()) <> 1 then raise exception 'Migration lost current bulletin'; end if;
end $$;
do $$ begin
  begin
    perform publish_bulletin('Stale','2026-10-18','22222222-2222-4222-8222-222222222222.png',0);
    raise exception 'Stale version accepted' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    update bulletin set title='Bypass';
    raise exception 'Direct write accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end $$;
select publish_bulletin('New Weekly','2026-10-25','22222222-2222-4222-8222-222222222222.png',0);
select publish_bulletin('Updated old','2026-10-18','11111111-1111-4111-8111-111111111111.jpg',1);
do $$ begin
  if jsonb_array_length(get_bulletin_history()) <> 2 then raise exception 'History missing'; end if;
  if get_public_bulletin()->>'title' <> 'New Weekly' then raise exception 'Old edit replaced latest'; end if;
  delete from storage.objects where name='11111111-1111-4111-8111-111111111111.jpg';
  if not exists(select 1 from storage.objects where name='11111111-1111-4111-8111-111111111111.jpg') then raise exception 'Saved history image deleted'; end if;
end $$;
do $$ declare r text; s text; begin
  foreach r in array array['owner','admin','leader','staff','assistant','welcome','member'] loop
    foreach s in array array['active','care','new','inactive'] loop
      perform set_config('test.role',r,true); perform set_config('test.status',s,true);
      if can_manage_bulletin() <> (r in ('owner','admin') and s in ('active','care')) then raise exception 'Wrong role boundary'; end if;
      if not can_manage_bulletin() then
        begin
          perform get_bulletin_history();
          raise exception 'Unauthorized history accepted' using errcode='XX000';
        exception when sqlstate 'P0001' then null; end;
        begin
          perform publish_bulletin('Denied','2026-10-25','22222222-2222-4222-8222-222222222222.png',1);
          raise exception 'Unauthorized publish accepted' using errcode='XX000';
        exception when sqlstate 'P0001' then null; end;
        begin
          insert into storage.objects(bucket_id,name) values ('bulletins','33333333-3333-4333-8333-333333333333.jpg');
          raise exception 'Unauthorized upload accepted' using errcode='XX000';
        exception when insufficient_privilege then null; end;
      end if;
    end loop;
  end loop;
end $$;
set local role anon;
do $$ begin
  if get_public_bulletin()->>'title' <> 'New Weekly' then raise exception 'Public read failed'; end if;
  begin
    perform get_bulletin_history();
    raise exception 'Anonymous history exposed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  if (select count(*) from storage.objects) <> 1 then raise exception 'Unpublished image exposed'; end if;
  begin
    perform publish_bulletin('Denied','2026-10-25','22222222-2222-4222-8222-222222222222.png',1);
    raise exception 'Anonymous publish accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin if (select count(*) from test_audit) <> 3 then raise exception 'Audit mismatch'; end if; end $$;
rollback;
\echo 'Bulletin integration tests passed'
