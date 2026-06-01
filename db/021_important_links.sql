create table if not exists important_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  url text not null unique,
  icon_key text not null default 'default' check (icon_key in ('website', 'links', 'youtube', 'instagram', 'default')),
  display_order integer not null default 100,
  created_by_member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists important_links_display_order_idx
on important_links(display_order, created_at);

alter table important_links enable row level security;

drop policy if exists "authenticated users can read important links" on important_links;
create policy "authenticated users can read important links"
on important_links for select
to authenticated
using (true);

drop policy if exists "soonjang and above can create important links" on important_links;
create policy "soonjang and above can create important links"
on important_links for insert
to authenticated
with check (current_member_role() in ('owner', 'admin', 'leader', 'staff'));

drop policy if exists "owners and admins can delete important links" on important_links;
create policy "owners and admins can delete important links"
on important_links for delete
to authenticated
using (current_member_role() in ('owner', 'admin'));

insert into important_links (title, description, url, icon_key, display_order)
values
  ('뉴웨이브 공식 홈페이지', '공동체 소개와 공식 안내를 확인합니다.', 'https://www.ccsnewave.org/', 'website', 10),
  ('뉴웨이브 링크트리', '신청서, 공지, 각종 링크를 모아둔 페이지입니다.', 'https://linktr.ee/ccsnewave', 'links', 20),
  ('뉴웨이브 유튜브', '예배와 영상 콘텐츠를 확인합니다.', 'https://www.youtube.com/@ccsnewave', 'youtube', 30),
  ('뉴웨이브 인스타그램', '공동체 소식과 사진을 확인합니다.', 'https://www.instagram.com/ccsnewave/', 'instagram', 40)
on conflict (url) do update
set
  title = excluded.title,
  description = excluded.description,
  icon_key = excluded.icon_key,
  display_order = excluded.display_order,
  updated_at = now();
