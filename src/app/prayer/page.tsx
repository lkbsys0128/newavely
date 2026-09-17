import { PrayerMeetingPage } from "@/components/prayer-meeting-page";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { seattleDate, type PrayerMeeting, type PrayerSummary } from "@/lib/prayer-meetings";

export const dynamic = "force-dynamic";
export const metadata = { title: "오늘의 기도회 | Newavely" };

export default async function PrayerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = seattleDate();
  let canEdit = false;
  let meeting: PrayerMeeting | null = null;
  let history: PrayerSummary[] = [];
  let count = 0;
  let error = "";
  const page = Math.max(1, Math.min(10000, Number.parseInt(String(params.page ?? "1"), 10) || 1));
  let creating = false;
  try {
    if (!hasSupabaseEnv()) throw new Error("setup");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: member, error: memberError } = await supabase.from("members").select("id, status").eq("auth_user_id", user.id).maybeSingle();
      if (memberError) throw memberError;
      canEdit = Boolean(member && member.status !== "inactive");
    }
    if (canEdit) {
      creating = params.new === "1";
      const result = await supabase.from("prayer_meetings").select("id, event_date, created_at", { count: "exact" })
        .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
      if (result.error) throw result.error;
      history = result.data as PrayerSummary[];
      count = result.count ?? 0;
      if (!creating) {
        const query = supabase.from("prayer_meetings").select("id, event_date, entries, version, created_at, updated_at");
        const selected = typeof params.id === "string"
          ? await query.eq("id", params.id).maybeSingle()
          : await query.order("event_date", { ascending: false }).limit(1).maybeSingle();
        if (selected.error) throw selected.error;
        meeting = selected.data as PrayerMeeting | null;
        if (params.id && !meeting) error = "선택한 기도회를 찾을 수 없습니다.";
      }
    } else {
      // Ignore all event/history query parameters for public viewers.
      const latest = await supabase.rpc("get_latest_prayer_meeting");
      if (latest.error) throw latest.error;
      meeting = latest.data as PrayerMeeting | null;
    }
  } catch {
    error = "기도회 순서를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.";
  }
  return <main className="main-content prayer-page"><PrayerMeetingPage key={`${meeting?.id ?? (creating ? "new" : "empty")}:${meeting?.version ?? 0}`}
    meeting={meeting} history={history} canEdit={canEdit && !error} creating={creating} today={today}
    page={page} count={count} error={error} /></main>;
}
