-- Preserve the current bulletin while switching to one saved bulletin per date.
alter table public.bulletin drop constraint bulletin_pkey;
alter table public.bulletin drop column singleton;
alter table public.bulletin add primary key (event_date);

create or replace function public.get_public_bulletin()
returns jsonb language sql stable security definer set search_path = public
as $$ select jsonb_build_object('title', title, 'event_date', event_date, 'image_path', image_path, 'version', version)
  from public.bulletin order by event_date desc limit 1; $$;

create or replace function public.get_bulletin_history()
returns jsonb language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.can_manage_bulletin() then raise exception '관리자만 지난 주보를 볼 수 있습니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('title', title, 'event_date', event_date,
    'image_path', image_path, 'version', version) order by event_date desc) from public.bulletin), '[]'::jsonb);
end; $$;
revoke all on function public.get_bulletin_history() from public, anon;
grant execute on function public.get_bulletin_history() to authenticated;

drop policy "admins remove unpublished bulletin uploads" on storage.objects;
create or replace function public.is_saved_bulletin_image(p_path text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.bulletin where image_path=p_path); $$;
revoke all on function public.is_saved_bulletin_image(text) from public, anon;
grant execute on function public.is_saved_bulletin_image(text) to authenticated;
create policy "admins remove unpublished bulletin uploads" on storage.objects for delete to authenticated
using (bucket_id='bulletins' and public.can_manage_bulletin() and not public.is_saved_bulletin_image(name));

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
  perform pg_advisory_xact_lock(50050);
  if not exists(select 1 from storage.objects where bucket_id='bulletins' and name=p_path) then
    raise exception '업로드된 이미지를 찾을 수 없습니다.';
  end if;
  select * into prior from public.bulletin where event_date=p_date;
  if coalesce(prior.version,0) <> p_version then
    raise exception '이 날짜의 주보가 이미 저장되었거나 변경되었습니다. 목록에서 다시 열어주세요.';
  end if;
  insert into public.bulletin(title,event_date,image_path,version)
  values(btrim(p_title),p_date,p_path,p_version+1)
  on conflict(event_date) do update set title=excluded.title,image_path=excluded.image_path,
    version=excluded.version,updated_at=now() returning * into saved;
  perform public.record_audit_log('bulletin.publish','bulletin',null,
    case when prior.version is null then null else to_jsonb(prior) end,to_jsonb(saved));
  return to_jsonb(saved);
end; $$;
