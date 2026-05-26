"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, type Role } from "@/lib/rbac";
import { getOrCreateCurrentMember } from "@/lib/supabase/data";

const memberSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  groupId: z.string().uuid().nullable(),
  role: z.enum(["admin", "leader", "staff", "member"]),
  status: z.enum(["active", "new", "care"]),
});

export async function createMember(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("로그인이 필요합니다.");

  const currentMember = await getOrCreateCurrentMember(supabase, {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name,
  });

  if (!hasPermission(currentMember.role, "members:write")) {
    throw new Error("멤버 추가 권한이 없습니다.");
  }

  const parsed = memberSchema.parse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    groupId: String(formData.get("groupId") || "") || null,
    role: formData.get("role"),
    status: formData.get("status"),
  });

  const { error } = await supabase.from("members").insert({
    name: parsed.name,
    phone: parsed.phone,
    group_id: parsed.groupId,
    role: parsed.role,
    status: parsed.status,
    email: `${parsed.name.replace(/\s/g, "").toLowerCase()}-${Date.now()}@placeholder.local`,
    care_notes: "추가 정보 입력 필요",
  });

  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/members");
  revalidatePath("/groups");
}

export async function toggleAttendance(memberId: string, eventId: string, nextPresent: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("로그인이 필요합니다.");

  const currentMember = await getOrCreateCurrentMember(supabase, {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name,
  });

  if (!hasPermission(currentMember.role, "attendance:write")) {
    throw new Error("출석 체크 권한이 없습니다.");
  }

  const { error } = await supabase.from("attendance_records").upsert(
    {
      event_id: eventId,
      member_id: memberId,
      status: nextPresent ? "present" : "absent",
      checked_by_member_id: currentMember.id,
      checked_at: new Date().toISOString(),
    },
    { onConflict: "event_id,member_id" },
  );

  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/attendance");
  revalidatePath("/groups");
}
