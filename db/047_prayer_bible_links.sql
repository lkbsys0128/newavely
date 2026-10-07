-- Apply after 046. HTTP is allowed only for canonical HolyBible chapter links.
create or replace function public.is_prayer_bible_link(value text)
returns boolean language plpgsql immutable set search_path = public
as $$
declare parts text[]; book integer; chapter integer;
  chapters integer[] := array[50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
begin
  parts := regexp_match(value, '^http://www[.]holybible[.]or[.]kr/mobile/B_GAE/cgi-m/bibleftxt[.]php[?]VR=GAE&VL=([1-9][0-9]?)&CN=([1-9][0-9]{0,2})&CV=99$');
  if parts is null then return false; end if;
  book := parts[1]::integer; chapter := parts[2]::integer;
  return coalesce(book between 1 and 66 and chapter between 1 and chapters[book], false);
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
       or (entry - 'title' - 'detail' - 'sourceUrl') <> '{}'::jsonb then
      raise exception '항목 이름과 상세 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (
      jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl'))
    ) then raise exception '원문 링크를 확인해주세요.'; end if;
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
      or (entry - 'title' - 'detail' - 'sourceUrl') <> '{}'::jsonb then
      raise exception '항목 이름과 내용을 확인해주세요.';
    end if;
    if entry ? 'sourceUrl' and (jsonb_typeof(entry->'sourceUrl') is distinct from 'string'
      or char_length(entry->>'sourceUrl') > 2000
      or ((entry->>'sourceUrl') <> '' and (entry->>'sourceUrl') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' and not public.is_prayer_bible_link(entry->>'sourceUrl')))
      then raise exception '원문 링크를 확인해주세요.'; end if;
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
