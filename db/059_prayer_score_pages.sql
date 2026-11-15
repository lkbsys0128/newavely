create or replace function public.valid_prayer_generation_result(p_input jsonb, p_entries jsonb, p_result jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public
as $$
declare song jsonb; entry jsonb; devotional jsonb; note jsonb; position integer; row_index integer;
  before_count integer; song_count integer; requested_title text; url_key text; bible_url text; verse_match text[]; end_chapter integer;
  score_pages jsonb; score_labels jsonb; score_page jsonb; page_index integer;
  book_names text[] := array['창세기','출애굽기','레위기','민수기','신명기','여호수아','사사기','룻기','사무엘상','사무엘하','열왕기상','열왕기하','역대상','역대하','에스라','느헤미야','에스더','욥기','시편','잠언','전도서','아가','이사야','예레미야','예레미야애가','에스겔','다니엘','호세아','요엘','아모스','오바댜','요나','미가','나훔','하박국','스바냐','학개','스가랴','말라기','마태복음','마가복음','누가복음','요한복음','사도행전','로마서','고린도전서','고린도후서','갈라디아서','에베소서','빌립보서','골로새서','데살로니가전서','데살로니가후서','디모데전서','디모데후서','디도서','빌레몬서','히브리서','야고보서','베드로전서','베드로후서','요한일서','요한이서','요한삼서','유다서','요한계시록'];
begin
  if jsonb_typeof(p_input->'beforeSongs') is distinct from 'array' or jsonb_typeof(p_input->'afterSongs') is distinct from 'array' then return false; end if;
  before_count := jsonb_array_length(p_input->'beforeSongs');
  song_count := before_count + jsonb_array_length(p_input->'afterSongs');
  if song_count not between 1 and 8 then return false; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_typeof(p_result) is distinct from 'object' then return false; end if;
  if jsonb_array_length(p_entries) <> song_count + 4 or octet_length(p_entries::text) > 60000
    or octet_length(p_result::text) > 65000
    or (p_result - array['songs','devotional','notes']) <> '{}'::jsonb
    or jsonb_typeof(p_result->'songs') is distinct from 'array'
    or jsonb_typeof(p_result->'devotional') is distinct from 'object'
    or jsonb_typeof(p_result->'notes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_result->'songs') <> song_count or jsonb_array_length(p_result->'notes') > 8 then return false; end if;
  if p_entries->0 <> jsonb_build_object('title','기도','detail','시작기도')
    or p_entries->(before_count + 1) <> jsonb_build_object('title','기도','detail',E'릴레이 기도\n마무리 기도')
    or p_entries->(song_count + 3) <> jsonb_build_object('title','기도','detail',E'통성기도\n마무리 기도') then return false; end if;
  for position in 0..(song_count - 1) loop
    song := p_result->'songs'->position;
    row_index := case when position < before_count then position + 1 else position + 3 end;
    entry := p_entries->row_index;
    requested_title := case when position < before_count then p_input->'beforeSongs'->>position else p_input->'afterSongs'->>(position - before_count) end;
    if jsonb_typeof(song) is distinct from 'object' or jsonb_typeof(entry) is distinct from 'object' then return false; end if;
    if (song - array['requestedTitle','title','artist','lyricsUrl','scoreImageUrl','additionalScoreImageUrls','scoreSourceUrl','scoreKey','lyricsVerified','scoreImageVerified','verifiedAt']) <> '{}'::jsonb
      or song->>'requestedTitle' is distinct from requested_title
      or jsonb_typeof(song->'requestedTitle') is distinct from 'string'
      or jsonb_typeof(song->'title') is distinct from 'string'
      or char_length(btrim(song->>'title')) not between 1 and 120 or (song->>'title') ~ '[[:cntrl:]]'
      or jsonb_typeof(song->'artist') is distinct from 'string'
      or char_length(btrim(song->>'artist')) not between 1 and 120 or (song->>'artist') ~ '[[:cntrl:]]'
      or song->'lyricsVerified' is distinct from 'true'::jsonb
      or song->'scoreImageVerified' is distinct from 'true'::jsonb
      or jsonb_typeof(song->'verifiedAt') is distinct from 'string'
      or char_length(song->>'verifiedAt') > 64
      or (song->>'verifiedAt') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?Z$'
      or (song ? 'scoreKey' and (jsonb_typeof(song->'scoreKey') is distinct from 'string' or char_length(btrim(song->>'scoreKey')) not between 1 and 40 or (song->>'scoreKey') ~ '[[:cntrl:]]'))
      then return false; end if;
    foreach url_key in array array['lyricsUrl','scoreImageUrl','scoreSourceUrl'] loop
      if jsonb_typeof(song->url_key) is distinct from 'string' or char_length(song->>url_key) > 2000
        or (song->>url_key) !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$' then return false; end if;
    end loop;
    if song ? 'additionalScoreImageUrls' then
      if jsonb_typeof(song->'additionalScoreImageUrls') is distinct from 'array' then return false; end if;
      if jsonb_array_length(song->'additionalScoreImageUrls') > 8 then return false; end if;
    end if;
    score_pages := jsonb_build_array(song->>'scoreImageUrl') || coalesce(song->'additionalScoreImageUrls','[]'::jsonb);
    if (select count(distinct value) from jsonb_array_elements(score_pages)) <> jsonb_array_length(score_pages) then return false; end if;
    score_labels := jsonb_build_object(song->>'lyricsUrl','가사');
    page_index := 0;
    for score_page in select value from jsonb_array_elements(score_pages) loop
      page_index := page_index + 1;
      if jsonb_typeof(score_page) is distinct from 'string'
        or char_length(score_page #>> '{}') > 2000
        or (score_page #>> '{}') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$'
        or (score_page #>> '{}') in (song->>'lyricsUrl',song->>'scoreSourceUrl',p_result#>>'{devotional,sourceUrl}')
        or (score_page #>> '{}') ~* '^https://([A-Za-z0-9-]+[.])*(duranno[.]com|fondant[.]kr|cgntv[.]net)([:/?#]|$)'
        then return false; end if;
      score_labels := score_labels || jsonb_build_object(score_page #>> '{}',case when jsonb_array_length(score_pages)=1 then '악보' else '악보 '||page_index end);
    end loop;
    if (song->>'lyricsUrl') !~ '^https://music[.]bugs[.]co[.]kr/track/[0-9]+/?$'
      or entry->>'title' is distinct from '찬양' or entry->>'detail' is distinct from song->>'title'
      or song->>'scoreImageUrl' = song->>'lyricsUrl' or song->>'scoreImageUrl' = song->>'scoreSourceUrl'
      or (song->>'scoreImageUrl') ~* '^https://([A-Za-z0-9-]+[.])*(duranno[.]com|fondant[.]kr|cgntv[.]net)([:/?#]|$)'
      or song->>'scoreImageUrl' = p_result#>>'{devotional,sourceUrl}'
      or (entry - array['title','detail','sourceUrl','additionalSourceUrls','sourceLabels']) <> '{}'::jsonb
      or entry->>'sourceUrl' is distinct from song->>'lyricsUrl'
      or entry->'additionalSourceUrls' is distinct from score_pages
      or entry->'sourceLabels' is distinct from score_labels
      then return false; end if;
  end loop;
  devotional := p_result->'devotional';
  if (devotional - array['date','title','book','chapter','passage','sourceUrl','verifiedAt']) <> '{}'::jsonb
    or devotional->>'date' is distinct from p_input->>'eventDate'
    or jsonb_typeof(devotional->'date') is distinct from 'string'
    or jsonb_typeof(devotional->'title') is distinct from 'string'
    or char_length(btrim(devotional->>'title')) not between 1 and 120 or (devotional->>'title') ~ '[[:cntrl:]]'
    or jsonb_typeof(devotional->'passage') is distinct from 'string'
    or char_length(btrim(devotional->>'passage')) not between 1 and 120 or (devotional->>'passage') ~ '[[:cntrl:]]'
    or jsonb_typeof(devotional->'book') is distinct from 'number' or (devotional->>'book') !~ '^[1-9][0-9]?$'
    or jsonb_typeof(devotional->'chapter') is distinct from 'number' or (devotional->>'chapter') !~ '^[1-9][0-9]{0,2}$'
    or jsonb_typeof(devotional->'sourceUrl') is distinct from 'string' or char_length(devotional->>'sourceUrl') > 2000
    or (devotional->>'sourceUrl') !~ '^https://(www[.])?(duranno[.]com|fondant[.]kr)([/?#][^[:space:]]*)?$'
    or jsonb_typeof(devotional->'verifiedAt') is distinct from 'string' or char_length(devotional->>'verifiedAt') > 64
    or (devotional->>'verifiedAt') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?Z$' then return false; end if;
  bible_url := 'http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL='
    || (devotional->>'book') || '&CN=' || (devotional->>'chapter') || '&CV=99';
  if not public.is_prayer_bible_link(bible_url) then return false; end if;
  verse_match := regexp_match(devotional->>'passage', '^' || book_names[(devotional->>'book')::integer]
    || ' ' || (devotional->>'chapter') || ':([1-9][0-9]{0,2})(?:[-–](?:([1-9][0-9]{0,2}):)?([1-9][0-9]{0,2}))?$');
  if verse_match is null then return false; end if;
  end_chapter := coalesce(verse_match[2]::integer,(devotional->>'chapter')::integer);
  if end_chapter < (devotional->>'chapter')::integer
    or not public.is_prayer_bible_link('http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL='
      ||(devotional->>'book')||'&CN='||end_chapter||'&CV=99')
    or (end_chapter = (devotional->>'chapter')::integer and coalesce(verse_match[3]::integer,verse_match[1]::integer) < verse_match[1]::integer)
    then return false; end if;
  entry := p_entries->(before_count + 2);
  if not public.is_prayer_bible_link(bible_url) or jsonb_typeof(entry) is distinct from 'object'
    or (entry - array['title','detail','sourceUrl','additionalSourceUrls','sourceLabels']) <> '{}'::jsonb
    or entry->>'title' is distinct from '묵상/나눔'
    or entry->>'detail' is distinct from (devotional->>'passage') || E'\n생명의삶 — ' || (devotional->>'title')
    or entry->>'sourceUrl' is distinct from bible_url
    or (entry ? 'additionalSourceUrls' and entry->'additionalSourceUrls' <> '[]'::jsonb) then return false; end if;
  for note in select * from jsonb_array_elements(p_result->'notes') loop
    if jsonb_typeof(note) is distinct from 'string' or char_length(btrim(note #>> '{}')) not between 1 and 300 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_prayer_generation_result(jsonb, jsonb, jsonb) from public, anon, authenticated;
