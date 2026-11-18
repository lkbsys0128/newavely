-- Private recovery drafts never create or update a published meeting.
alter table public.prayer_generation_requests add column if not exists draft jsonb;

create or replace function public.prayer_generation_public(p_request public.prayer_generation_requests)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public
as $$
declare summary jsonb;
begin
  if p_request.result is not null then
    summary := jsonb_build_object(
      'songs', (select jsonb_agg(jsonb_build_object('title', song->'title', 'artist', song->'artist') order by position)
        from jsonb_array_elements(p_request.result->'songs') with ordinality as items(song, position)),
      'passage', p_request.result #> '{devotional,passage}',
      'devotionalTitle', p_request.result #> '{devotional,title}',
      'notes', p_request.result->'notes');
  end if;
  return jsonb_build_object(
    'id', p_request.id, 'event_date', p_request.event_date, 'input', p_request.input,
    'status', p_request.status, 'message', p_request.message, 'meeting_id', p_request.meeting_id,
    'draft', p_request.draft, 'result_summary', summary, 'created_at', p_request.created_at, 'updated_at', p_request.updated_at,
    'expires_at', p_request.expires_at, 'dispatched', p_request.dispatched_at is not null);
end;
$$;
revoke all on function public.prayer_generation_public(public.prayer_generation_requests) from public, anon, authenticated;

create or replace function public.save_prayer_generation_draft(p_id uuid, p_token text, p_draft jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare request public.prayer_generation_requests%rowtype; entry jsonb; issue jsonb; url text;
begin
  request := public.lock_prayer_generation_callback(p_id, p_token);
  if request.status = 'needs_input' and request.draft is not null then return public.prayer_generation_public(request); end if;
  if request.status not in ('queued','running') then raise exception 'Request is no longer active.'; end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or (p_draft - 'eventDate' - 'entries' - 'issues') <> '{}'
    or p_draft->>'eventDate' is distinct from request.event_date::text
    or jsonb_typeof(p_draft->'entries') is distinct from 'array'
    or jsonb_typeof(p_draft->'issues') is distinct from 'array'
    or length(p_draft::text) > 250000 or strpos(p_draft::text,p_token) > 0 then raise exception 'Invalid draft.'; end if;
  if jsonb_array_length(p_draft->'entries') <> jsonb_array_length(request.input->'beforeSongs') + jsonb_array_length(request.input->'afterSongs') + 4
    or jsonb_array_length(p_draft->'issues') > 24 then raise exception 'Invalid draft length.'; end if;
  for entry in select value from jsonb_array_elements(p_draft->'entries') loop
    if jsonb_typeof(entry) <> 'object' or (entry - 'title' - 'detail' - 'sourceUrl' - 'additionalSourceUrls' - 'sourceLabels') <> '{}'
      or jsonb_typeof(entry->'title') is distinct from 'string' or length(entry->>'title') not between 1 and 120
      or jsonb_typeof(entry->'detail') is distinct from 'string' or length(entry->>'detail') > 500 then raise exception 'Invalid draft entry.'; end if;
    if entry ? 'sourceUrl' and jsonb_typeof(entry->'sourceUrl') <> 'string' then raise exception 'Invalid URL.'; end if;
    if entry ? 'additionalSourceUrls' and jsonb_typeof(entry->'additionalSourceUrls') <> 'array' then raise exception 'Invalid links.'; end if;
    if jsonb_array_length(coalesce(entry->'additionalSourceUrls','[]')) > 9 then raise exception 'Too many links.'; end if;
    for url in select value from jsonb_array_elements_text(coalesce(entry->'additionalSourceUrls','[]') || case when entry ? 'sourceUrl' then jsonb_build_array(entry->'sourceUrl') else '[]'::jsonb end) loop
      if url is null or length(url) > 2000 or (url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}([/?#][^[:space:]]*)?$'
        and url !~ '^http://www[.]holybible[.]or[.]kr/mobile/B_GAE/cgi-m/bibleftxt[.]php[?]VR=GAE&VL=[1-9][0-9]?&CN=[1-9][0-9]{0,2}&CV=99$') then raise exception 'Invalid draft link.'; end if;
    end loop;
    if entry ? 'sourceLabels' then
      if jsonb_typeof(entry->'sourceLabels') <> 'object' then raise exception 'Invalid labels.'; end if;
      if (select count(*) from jsonb_each(entry->'sourceLabels')) > 10
        or exists(select 1 from jsonb_each(entry->'sourceLabels') l where jsonb_typeof(l.value) <> 'string' or length(l.value #>> '{}') > 120
          or not (coalesce(entry->'additionalSourceUrls','[]') || jsonb_build_array(entry->'sourceUrl')) @> jsonb_build_array(l.key)) then raise exception 'Invalid labels.'; end if;
    end if;
  end loop;
  for issue in select value from jsonb_array_elements(p_draft->'issues') loop
    if jsonb_typeof(issue) <> 'object' or (issue - 'entryIndex' - 'message') <> '{}'
      or jsonb_typeof(issue->'entryIndex') is distinct from 'number' or (issue->>'entryIndex') !~ '^[0-9]+$'
      or (issue->>'entryIndex')::integer >= jsonb_array_length(p_draft->'entries')
      or jsonb_typeof(issue->'message') is distinct from 'string' or length(issue->>'message') > 200 then raise exception 'Invalid draft issue.'; end if;
  end loop;
  update public.prayer_generation_requests set draft=p_draft, status='needs_input',
    message='확인된 자료를 비공개 초안에 보관했습니다. 표시된 항목을 보완한 뒤 저장해주세요.', updated_at=clock_timestamp()
    where id=p_id returning * into request;
  return public.prayer_generation_public(request);
end;
$$;
revoke all on function public.save_prayer_generation_draft(uuid,text,jsonb) from public;
grant execute on function public.save_prayer_generation_draft(uuid,text,jsonb) to anon, authenticated;
