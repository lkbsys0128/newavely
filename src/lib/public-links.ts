import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportantLink } from "./types";

export type PublicLink = Pick<ImportantLink, "id" | "title" | "description" | "url" | "iconKey">;

export async function getPublicLinks(supabase: SupabaseClient): Promise<PublicLink[]> {
  const { data, error } = await supabase.rpc("get_public_important_links");
  if (error) throw error;
  return (data ?? []).filter((link: { url: string }) => {
    try {
      const url = new URL(link.url);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }).map((link: { id: string; title: string; description: string | null; url: string; icon_key: ImportantLink["iconKey"] }) => ({
    id: link.id,
    title: link.title,
    description: link.description ?? "",
    url: link.url,
    iconKey: link.icon_key,
  }));
}
