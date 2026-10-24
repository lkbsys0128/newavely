import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { bulletinBucket, canManageBulletin, validBulletinDate, type Bulletin } from "@/lib/bulletin";
import { BulletinPage } from "@/components/bulletin-page";
import { seattleDate } from "@/lib/prayer-meetings";

export const dynamic = "force-dynamic";
export const metadata = { title: "주보 | Newavely" };

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  let history: Bulletin[] = [];
  let latestDate = "";
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
    latestDate = bulletin?.event_date ?? "";
    // Anonymous and non-admin viewers always receive only the latest bulletin.
    if (canEdit) {
      const past = await supabase.rpc("get_bulletin_history");
      if (past.error) throw past.error;
      history = (past.data ?? []) as Bulletin[];
      if (params.date && validBulletinDate(params.date)) {
        bulletin = history.find((item) => item.event_date === params.date) ?? bulletin;
      }
    }
    if (bulletin) {
      const signed = await supabase.storage.from(bulletinBucket).createSignedUrl(bulletin.image_path, 3600);
      if (signed.error) throw signed.error;
      imageUrl = signed.data.signedUrl;
    }
  } catch {
    error = "주보를 불러오지 못했습니다. 잠시 후 새로고침해주세요.";
  }
  return <main className="main-content bulletin-page"><BulletinPage key={bulletin?.event_date ?? "empty"} bulletin={bulletin} history={history} latestDate={latestDate} imageUrl={imageUrl} canEdit={canEdit && !error} error={error} today={seattleDate()} /></main>;
}
