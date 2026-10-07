"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canManagePrayer } from "@/lib/prayer-access";
import { preparePrayerTemplate, prayerTemplateSchema, type PrayerTemplate } from "@/lib/prayer-templates";
import { createClient } from "@/lib/supabase/server";

async function templateClient() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("멤버 등록 승인 후 템플릿을 사용할 수 있습니다.");
  const { data, error } = await client.from("members").select("status").eq("auth_user_id", user.id).maybeSingle();
  if (error || !canManagePrayer(data)) throw new Error("멤버 등록 승인 후 템플릿을 사용할 수 있습니다.");
  return client;
}

export async function listPrayerTemplates(): Promise<{ templates: PrayerTemplate[]; message: string }> {
  try {
    const client = await templateClient();
    const { data, error } = await client.from("prayer_templates").select("id, name, entries, version, updated_at").order("name");
    if (error) return { templates: [], message: "템플릿을 불러오지 못했습니다. DB 업데이트 적용 여부를 확인해주세요." };
    return { templates: data as PrayerTemplate[], message: "" };
  } catch { return { templates: [], message: "템플릿 접근 권한 또는 연결을 확인해주세요." }; }
}

export async function savePrayerTemplate(input: unknown): Promise<{ ok: boolean; message: string; template?: PrayerTemplate }> {
  const parsed = prayerTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." };
  try {
    const client = await templateClient();
    const { id, version, name, entries, clearContents } = parsed.data;
    const { data, error } = await client.rpc("save_prayer_template", {
      p_id: id, p_version: version, p_name: name, p_entries: preparePrayerTemplate(entries, clearContents),
    });
    if (error) return { ok: false, message: error.code === "P0001" ? error.message : "템플릿을 저장하지 못했습니다." };
    revalidatePath("/prayer");
    return { ok: true, message: "템플릿을 저장했습니다. 기도회는 별도로 저장해주세요.", template: data as PrayerTemplate };
  } catch { return { ok: false, message: "권한 또는 연결을 확인해주세요. 작성 내용은 유지됩니다." }; }
}

export async function deletePrayerTemplate(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = z.object({ id: z.string().uuid(), version: z.number().int().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "삭제할 템플릿을 확인해주세요." };
  try {
    const client = await templateClient();
    const { error } = await client.rpc("delete_prayer_template", { p_id: parsed.data.id, p_version: parsed.data.version });
    if (error) return { ok: false, message: error.code === "P0001" ? error.message : "템플릿을 삭제하지 못했습니다." };
    revalidatePath("/prayer");
    return { ok: true, message: "템플릿을 삭제했습니다. 기존 기도회는 유지됩니다." };
  } catch { return { ok: false, message: "권한 또는 연결을 확인해주세요." }; }
}
