"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bulletinBucket, bulletinImageType, bulletinMaxBytes, canManageBulletin, validBulletinDate } from "@/lib/bulletin";

export async function publishBulletin(form: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "로그인이 필요합니다." };
    const { data: member, error } = await supabase.from("members").select("role, status").eq("auth_user_id", user.id).maybeSingle();
    if (error || !canManageBulletin(member)) return { ok: false, message: "등록된 관리자만 주보를 올릴 수 있습니다." };
    const title = String(form.get("title") ?? "").trim();
    const date = String(form.get("date") ?? "");
    const version = Number(form.get("version"));
    const file = form.get("image");
    if (!title || title.length > 120 || !validBulletinDate(date) || !Number.isSafeInteger(version) || version < 0) {
      return { ok: false, message: "제목과 날짜를 확인해주세요." };
    }
    if (!(file instanceof File) || file.size === 0 || file.size > bulletinMaxBytes) return { ok: false, message: "3MB 이하의 JPEG 또는 PNG 파일을 선택해주세요." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = bulletinImageType(bytes);
    if (!type || file.type !== type) return { ok: false, message: "JPEG 또는 PNG 이미지만 올릴 수 있습니다." };
    const path = `${crypto.randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
    const upload = await supabase.storage.from(bulletinBucket).upload(path, bytes, { contentType: type, upsert: false });
    if (upload.error) return { ok: false, message: "이미지를 올리지 못했습니다. 잠시 후 다시 시도해주세요." };
    const saved = await supabase.rpc("publish_bulletin", { p_title: title, p_date: date, p_path: path, p_version: version });
    if (saved.error) {
      // Remove only this attempt's unpublished upload, never the previous bulletin.
      await supabase.storage.from(bulletinBucket).remove([path]);
      return { ok: false, message: saved.error.code === "P0001" ? saved.error.message : "주보를 저장하지 못했습니다." };
    }
    revalidatePath("/bulletin");
    return { ok: true, message: "주보를 게시했습니다." };
  } catch {
    return { ok: false, message: "연결을 확인한 뒤 다시 시도해주세요." };
  }
}
