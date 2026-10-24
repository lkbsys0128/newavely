import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { bulletinBucket, canManageBulletin, type Bulletin } from "@/lib/bulletin";
import { BulletinPage } from "@/components/bulletin-page";
import { seattleDate } from "@/lib/prayer-meetings";

export const dynamic = "force-dynamic";
export const metadata = { title: "주보 | Newavely" };

export default async function Page() {
  let bulletin: Bulletin | null = null;
  let imageUrl = "";
  let canEdit = false;
  let error = "";
  try {
    if (!hasSupabaseEnv()) throw new Error("setup");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const member = await supabase.from("members").select("role, status").eq("auth_user_id", user.id).maybeSingle();
      if (member.error) throw member.error;
      canEdit = canManageBulletin(member.data);
    }
    const result = await supabase.rpc("get_public_bulletin");
    if (result.error) throw result.error;
    bulletin = result.data as Bulletin | null;
    if (bulletin) {
      const signed = await supabase.storage.from(bulletinBucket).createSignedUrl(bulletin.image_path, 3600);
      if (signed.error) throw signed.error;
      imageUrl = signed.data.signedUrl;
    }
  } catch {
    error = "주보를 불러오지 못했습니다. 잠시 후 새로고침해주세요.";
  }
  return <main className="main-content bulletin-page"><BulletinPage bulletin={bulletin} imageUrl={imageUrl} canEdit={canEdit && !error} error={error} today={seattleDate()} /></main>;
}
