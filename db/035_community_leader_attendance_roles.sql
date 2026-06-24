insert into member_custom_field_definitions (key, label, field_type, is_sensitive)
values ('community_leader_role', '공동체 리더 구분', 'text', false)
on conflict (key) do update
set
  label = excluded.label,
  field_type = excluded.field_type,
  is_sensitive = excluded.is_sensitive;

create index if not exists members_community_leader_role_idx
on members ((custom_fields ->> 'community_leader_role'))
where custom_fields ? 'community_leader_role';
