-- Latest public bulletin; private images and admin-only publication.
create table if not exists public.bulletin (
  singleton boolean primary key default true check (singleton),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  event_date date not null,
  image_path text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.bulletin enable row level security;
revoke all on public.bulletin from anon, authenticated;

create or replace function public.can_manage_bulletin()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and coalesce(public.current_member_status() in ('active','care'), false)
  and coalesce(public.current_member_role() in ('owner','admin'), false); $$;
revoke all on function public.can_manage_bulletin() from public;
grant execute on function public.can_manage_bulletin() to authenticated;

create or replace function public.get_public_bulletin()
returns jsonb language sql stable security definer set search_path = public
as $$ select jsonb_build_object('title', title, 'event_date', event_date, 'image_path', image_path, 'version', version)
  from public.bulletin where singleton; $$;
revoke all on function public.get_public_bulletin() from public;
grant execute on function public.get_public_bulletin() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bulletins', 'bulletins', false, 3145728, array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "public reads current bulletin image" on storage.objects for select to anon, authenticated
using (bucket_id = 'bulletins' and name = (public.get_public_bulletin()->>'image_path'));
create policy "admins upload bulletin images" on storage.objects for insert to authenticated
with check (bucket_id = 'bulletins' and public.can_manage_bulletin()
  and name ~ '^[0-9a-f-]{36}\.(jpg|png)$');
create policy "admins remove unpublished bulletin uploads" on storage.objects for delete to authenticated
using (bucket_id = 'bulletins' and public.can_manage_bulletin()
  and name is distinct from (public.get_public_bulletin()->>'image_path'));
create policy "admins inspect bulletin uploads" on storage.objects for select to authenticated
using (bucket_id = 'bulletins' and public.can_manage_bulletin());

create or replace function public.publish_bulletin(p_title text, p_date date, p_path text, p_version integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior public.bulletin%rowtype; saved public.bulletin%rowtype;
begin
  if not public.can_manage_bulletin() then raise exception '등록된 관리자만 주보를 올릴 수 있습니다.'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 or p_date is null
    or p_version is null or p_version < 0 or p_path is null or p_path !~ '^[0-9a-f-]{36}\.(jpg|png)$' then
    raise exception '주보 입력값을 확인해주세요.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'bulletins' and name = p_path) then
    raise exception '업로드된 이미지를 찾을 수 없습니다.';
  end if;
  -- Serialize even the first publication, where no row exists to lock yet.
  perform pg_advisory_xact_lock(50050);
  select * into prior from public.bulletin where singleton;
  if coalesce(prior.version, 0) <> p_version then
    raise exception '다른 관리자가 주보를 변경했습니다. 새로고침한 뒤 다시 확인해주세요.';
  end if;
  insert into public.bulletin(singleton,title,event_date,image_path,version)
  values (true,btrim(p_title),p_date,p_path,p_version+1)
  on conflict (singleton) do update set title=excluded.title, event_date=excluded.event_date,
    image_path=excluded.image_path, version=excluded.version, updated_at=now() returning * into saved;
  perform public.record_audit_log('bulletin.publish','bulletin',null,
    case when prior.version is null then null else to_jsonb(prior) end,to_jsonb(saved));
  return public.get_public_bulletin();
end;
$$;
revoke all on function public.publish_bulletin(text,date,text,integer) from public, anon;
grant execute on function public.publish_bulletin(text,date,text,integer) to authenticated;
