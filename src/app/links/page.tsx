import { LinksPageContent } from "@/components/dashboard";
import type { AppUser } from "@/lib/app-page-data";
import { getPublicLinks, type PublicLink } from "@/lib/public-links";
import { roles, type Role } from "@/lib/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  let user: AppUser | null = null;
  let importantLinks: PublicLink[] = [];
  let error = "";
  try {
    if (!hasSupabaseEnv()) throw new Error("setup");
    const supabase = await createClient();
    importantLinks = await getPublicLinks(supabase);
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data: member } = await supabase.from("members")
        .select("id, name, role, status").eq("auth_user_id", auth.user.id).maybeSingle();
      if (member && member.status !== "inactive" && roles.includes(member.role as Role)) {
        user = { id: member.id, name: member.name, role: member.role as Role, email: "" };
      }
    }
  } catch {
    error = "링크를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.";
  }
  return <main className="main-content">
    {error ? <section className="panel"><h1>링크</h1><p role="alert" className="error-message">{error}</p></section>
      : <LinksPageContent user={user} importantLinks={importantLinks} />}
  </main>;
}
