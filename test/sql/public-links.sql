-- Run only in an empty disposable PostgreSQL database. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.important_links') is not null then
    raise exception 'Use an empty disposable database, never production.';
  end if;
end $$;
create role anon;
create role authenticated;
create table public.important_links (
  id uuid primary key, title text, description text, url text, icon_key text,
  display_order integer, created_at timestamptz, created_by_member_id uuid
);
alter table public.important_links enable row level security;
grant select, insert, update, delete on public.important_links to anon, authenticated;
create policy authenticated_read on public.important_links for select to authenticated using (true);
insert into public.important_links values
  ('11111111-1111-4111-8111-111111111111', 'Second', 'Public description', 'https://example.com/2', 'website', 2, now(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'First', null, 'https://example.com/1', 'website', 1, now(), null);
\ir ../../db/043_public_important_links.sql
set local role anon;
do $$ declare payload jsonb; changed integer; begin
  select jsonb_agg(to_jsonb(l)) into payload from public.get_public_important_links() l;
  if jsonb_array_length(payload) <> 2 or payload->0->>'title' <> 'First' then raise exception 'Public read or ordering failed'; end if;
  if payload->0 ? 'created_by_member_id' or payload->0 ? 'created_at' then raise exception 'Private metadata leaked'; end if;
  if (select count(*) from public.important_links) <> 0 then raise exception 'Raw anonymous read allowed'; end if;
  begin
    insert into public.important_links (id, title) values ('33333333-3333-4333-8333-333333333333', 'Unauthorized');
    raise exception 'Anonymous insert allowed' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
  update public.important_links set title = 'Unauthorized';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Anonymous update allowed'; end if;
  delete from public.important_links;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Anonymous delete allowed'; end if;
end $$;
set local role authenticated;
do $$ begin
  if (select count(*) from public.get_public_important_links()) <> 2 then raise exception 'Authenticated public read failed'; end if;
end $$;
rollback;
