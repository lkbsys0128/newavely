-- Publish link content only; member metadata and all write policies stay private.
create or replace function public.get_public_important_links()
returns table (id uuid, title text, description text, url text, icon_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.description, l.url, l.icon_key
  from public.important_links l
  order by l.display_order, l.created_at, l.id;
$$;

revoke all on function public.get_public_important_links() from public;
grant execute on function public.get_public_important_links() to anon, authenticated;
