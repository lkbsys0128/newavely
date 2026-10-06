"use server";

import { revalidatePath } from "next/cache";
import { canManagePrayer } from "@/lib/prayer-access";
import { prayerMeetingSchema } from "@/lib/prayer-meetings";
import { createClient } from "@/lib/supabase/server";

export async function savePrayerMeeting(input: unknown): Promise<{ ok: boolean; message: string; id?: string }> {
  const parsed = prayerMeetingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다. 작성 내용은 그대로 유지됩니다." };
    const { data: member, error: memberError } = await supabase.from("members").select("id, status").eq("auth_user_id", user.id).maybeSingle();
    if (memberError || !canManagePrayer(member)) return { ok: false, message: "멤버 등록 승인 후 기도회를 수정할 수 있습니다." };
    const { id, version, eventDate, entries } = parsed.data;
    const { data, error } = await supabase.rpc("save_prayer_meeting", { p_id: id, p_version: version, p_event_date: eventDate, p_entries: entries });
    if (error) return { ok: false, message: error.code === "P0001" ? error.message : "저장하지 못했습니다. 잠시 후 다시 시도해주세요." };
    revalidatePath("/prayer");
    return { ok: true, message: "기도회 순서를 저장했습니다.", id: data.id };
  } catch {
    return { ok: false, message: "연결을 확인해주세요. 작성 내용은 그대로 유지됩니다." };
  }
}
