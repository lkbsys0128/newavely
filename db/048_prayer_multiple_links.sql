-- Apply after 047. Keep the original sourceUrl and allow up to nine extra links.
create or replace function public.valid_prayer_additional_links(entry jsonb)
returns boolean language plpgsql immutable set search_path = public
as $$
declare link jsonb; value text;
begin
  if not (entry ? 'additionalSourceUrls') then return true; end if;
  if jsonb_typeof(entry->'additionalSourceUrls') is distinct from 'array' then return false; end if;
  if jsonb_array_length(entry->'additionalSourceUrls') > 9 then return false; end if;
  for link in select * from jsonb_array_elements(entry->'additionalSourceUrls') loop
    if jsonb_typeof(link) is distinct from 'string' then return false; end if;
    value := link #>> '{}';
    if char_length(value) > 2000 or (value <> ''
      and value !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$'
      and not public.is_prayer_bible_link(value)) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.save_prayer_meeting(p_id uuid, p_version integer, p_event_date date, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior prayer_meetings%rowtype;
  saved prayer_meetings%rowtype;
  entry jsonb;
begin
  if auth.uid() is null or current_member_id() is null or not coalesce(current_member_status() in ('active', 'care'), false) then
    raise exception '로그인한 활성 멤버만 수정할 수 있습니다.';
  end if;
  if p_event_date is null or p_version is null or p_version < 0 then
    raise exception '날짜와 버전을 확인해주세요.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception '올바른 순서를 입력해주세요.';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception '순서는 1개에서 100개까지 등록할 수 있습니다.';
  end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'title') is distinct from 'string'
       or char_length(btrim(entry->>'title')) not between 1 and 120
       or jsonb_typeof(entry->'detail') is distinct from 'string' or char_length(entry->>'detail') > 500
       or (entry - 'title' - 'detail' - 'sourceUrl' - 'additionalSourceUrls') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (
      jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl'))
    ) then raise exception '원문 링크를 확인해주세요.'; end if;
    if not public.valid_prayer_additional_links(entry) then raise exception '추가 링크를 확인해주세요.'; end if;
  end loop;
  if p_id is null then
    if p_version <> 0 then raise exception '새 기도회 버전이 올바르지 않습니다.'; end if;
    insert into prayer_meetings(event_date, entries) values(p_event_date, p_entries) returning * into saved;
  else
    select * into prior from prayer_meetings where id = p_id for update;
    if not found then raise exception '기도회를 찾을 수 없습니다.'; end if;
    if prior.version <> p_version then
      raise exception '다른 멤버가 먼저 수정했습니다. 작성 내용을 보관한 뒤 최신 순서를 다시 열어주세요.';
    end if;
    update prayer_meetings set event_date = p_event_date, entries = p_entries,
      version = version + 1, updated_at = now() where id = p_id returning * into saved;
  end if;
  perform record_audit_log(
    case when p_id is null then 'prayer.create' else 'prayer.update' end,
    'prayer_meetings', saved.id,
    case when p_id is null then null else to_jsonb(prior) end, to_jsonb(saved), '{}'::jsonb);
  return to_jsonb(saved);
exception when unique_violation then
  raise exception '해당 날짜의 기도회가 이미 있습니다. 기존 기도회를 수정해주세요.';
end;
$$;

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
      or (entry - 'title' - 'detail' - 'sourceUrl' - 'additionalSourceUrls') <> '{}'::jsonb then
      raise exception '항목 이름과 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl')))
      then raise exception '원문 링크를 확인해주세요.'; end if;
    if not public.valid_prayer_additional_links(entry) then raise exception '추가 링크를 확인해주세요.'; end if;
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
