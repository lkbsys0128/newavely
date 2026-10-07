-- Apply after 045. Shared templates are private to approved members.
create table if not exists public.prayer_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  entries jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.prayer_templates enable row level security;
revoke all on public.prayer_templates from anon, authenticated;
grant select on public.prayer_templates to authenticated;
create policy "registered members read prayer templates" on public.prayer_templates
for select to authenticated using (public.is_registered_member());

create or replace function public.save_prayer_template(p_id uuid, p_version integer, p_name text, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare prior prayer_templates%rowtype; saved prayer_templates%rowtype; entry jsonb;
begin
  if not public.is_registered_member() then raise exception '멤버 등록 승인 후 템플릿을 사용할 수 있습니다.'; end if;
  if p_version is null or p_version < 0 or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception '템플릿 이름과 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception '순서를 확인해주세요.'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
      or char_length(btrim(entry->>'title')) not between 1 and 120
      or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
      or (entry - 'title' - 'detail' - 'sourceUrl') <> '{}'::jsonb then
      raise exception '항목 이름과 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$'))
      then raise exception 'HTTPS 원문 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 템플릿 버전을 확인해주세요.'; end if;
    insert into prayer_templates(name, entries) values(btrim(p_name), p_entries) returning * into saved;
  else
    select * into prior from prayer_templates where id = p_id for update;
    if not found then raise exception '템플릿이 삭제되었습니다. 목록을 새로고침해주세요.'; end if;
    if prior.version <> p_version then raise exception '다른 멤버가 변경했습니다. 목록을 새로고침한 후 다시 확인해주세요.'; end if;
    update prayer_templates set name=btrim(p_name), entries=p_entries, version=version+1, updated_at=now()
      where id=p_id returning * into saved;
  end if;
  perform record_audit_log(case when p_id is null then 'prayer_template.create' else 'prayer_template.update' end,
    'prayer_templates', saved.id, case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;

create or replace function public.delete_prayer_template(p_id uuid, p_version integer)
returns void language plpgsql security definer set search_path = public
as $$
declare prior prayer_templates%rowtype;
begin
  if not public.is_registered_member() then raise exception '멤버 등록 승인 후 템플릿을 사용할 수 있습니다.'; end if;
  select * into prior from prayer_templates where id=p_id for update;
  if not found then raise exception '템플릿이 이미 삭제되었습니다.'; end if;
  if p_version is null or prior.version <> p_version then raise exception '다른 멤버가 변경했습니다. 목록을 새로고침한 후 다시 확인해주세요.'; end if;
  delete from prayer_templates where id=p_id;
  perform record_audit_log('prayer_template.delete', 'prayer_templates', p_id, to_jsonb(prior), null);
end;
$$;
revoke all on function public.save_prayer_template(uuid, integer, text, jsonb) from public;
revoke all on function public.delete_prayer_template(uuid, integer) from public;
grant execute on function public.save_prayer_template(uuid, integer, text, jsonb) to authenticated;
grant execute on function public.delete_prayer_template(uuid, integer) to authenticated;

