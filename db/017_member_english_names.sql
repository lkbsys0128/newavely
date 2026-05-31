begin;

insert into member_custom_field_definitions (key, label, field_type, is_sensitive)
values ('english_name', '영어 이름', 'text', false)
on conflict (key) do update
set label = excluded.label,
    field_type = excluded.field_type,
    is_sensitive = excluded.is_sensitive;

with parsed as (
  select
    id,
    btrim(regexp_replace(name, '\s*\([A-Za-z][A-Za-z .''-]*\)\s*$', '')) as korean_name,
    btrim((regexp_match(name, '\s*\(([A-Za-z][A-Za-z .''-]*)\)\s*$'))[1]) as english_name
  from members
  where name ~ '\s*\([A-Za-z][A-Za-z .''-]*\)\s*$'
)
update members
set
  name = parsed.korean_name,
  custom_fields = coalesce(members.custom_fields, '{}'::jsonb) || jsonb_build_object('english_name', parsed.english_name),
  updated_at = now()
from parsed
where members.id = parsed.id
  and parsed.korean_name <> ''
  and parsed.english_name <> '';

commit;
