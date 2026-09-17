"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchPrayerSources, type PrayerSourceResult } from "@/lib/prayer-source-search";

export async function searchPrayerSources(input: unknown): Promise<{ results: PrayerSourceResult[]; error?: string }> {
  if (typeof input !== "string" || input.trim().length < 2 || input.trim().length > 120) return { results: [], error: "곡명을 2~120자로 입력해주세요." };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { results: [], error: "로그인이 필요합니다." };
    const { data: member, error } = await supabase.from("members").select("id, status").eq("auth_user_id", user.id).maybeSingle();
    if (error || !member || member.status === "inactive") return { results: [], error: "활성 멤버만 검색할 수 있습니다." };
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return { results: [], error: "검색 API가 아직 설정되지 않았습니다. 관리자에게 문의해주세요." };
    const limit = await supabase.rpc("claim_prayer_source_search");
    if (limit.error) return { results: [], error: "검색 설정을 확인해주세요. 잠시 후 다시 시도해주세요." };
    if (!limit.data) return { results: [], error: "검색 횟수가 많습니다. 1분 후 다시 시도해주세요." };
    return { results: await fetchPrayerSources(input.trim(), key) };
  } catch { return { results: [], error: "검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요." }; }
}
