"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac";
import { getOrCreateCurrentMember } from "@/lib/supabase/data";

const nullableUuid = z.preprocess((value) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}, z.string().uuid().nullable());

const nullableText = z.preprocess((value) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}, z.string().nullable());

const memberSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  groupId: nullableUuid,
  email: nullableText,
  address: nullableText,
  baptismStatus: nullableText,
  notes: nullableText,
  role: z.enum(["admin", "leader", "staff", "member"]),
  status: z.enum(["active", "new", "care", "inactive"]),
});

const updateMemberSchema = memberSchema.extend({
  id: z.string().uuid(),
});

const groupSchema = z.object({
  name: z.string().min(1),
  leaderMemberId: nullableUuid,
  targetSize: z.coerce.number().int().min(1).max(500),
});

const updateGroupSchema = groupSchema.extend({
  id: z.string().uuid(),
});

export type ActionState = {
  ok: boolean;
  message: string;
};

const initialErrorMessage = "작업 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

function toActionError(error: unknown) {
  if (error instanceof z.ZodError) {
    return "입력값을 확인해주세요.";
  }

  if (error && typeof error === "object") {
    const maybeError = error as { code?: unknown; message?: unknown };
    if (maybeError.code === "23505") {
      return "이미 사용 중인 이메일입니다. 다른 이메일을 입력해주세요.";
    }

    if (typeof maybeError.message === "string" && maybeError.message) {
      if (maybeError.message.includes("duplicate key")) {
        return "이미 사용 중인 값이 있습니다. 입력값을 확인해주세요.";
      }
      return maybeError.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return initialErrorMessage;
}

async function runAction(callback: () => Promise<string>): Promise<ActionState> {
  try {
    return { ok: true, message: await callback() };
  } catch (error) {
    return { ok: false, message: toActionError(error) };
  }
}

async function getAuthorizedCurrentMember(permission: "members:write" | "groups:write" | "attendance:write") {
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

  if (!hasPermission(currentMember.role, permission)) {
    throw new Error("작업 권한이 없습니다.");
  }

  return { supabase, currentMember };
}

function revalidateAppData() {
  revalidatePath("/");
  revalidatePath("/members");
  revalidatePath("/groups");
  revalidatePath("/attendance");
  revalidatePath("/permissions");
}

export async function createMember(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");

    const parsed = memberSchema.parse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      groupId: formData.get("groupId"),
      email: formData.get("email"),
      address: formData.get("address"),
      baptismStatus: formData.get("baptismStatus"),
      notes: formData.get("notes"),
      role: formData.get("role"),
      status: formData.get("status"),
    });

    const { error } = await supabase.from("members").insert({
      name: parsed.name,
      phone: parsed.phone,
      group_id: parsed.groupId,
      role: parsed.role,
      status: parsed.status,
      email: parsed.email ?? `${parsed.name.replace(/\s/g, "").toLowerCase()}-${Date.now()}@placeholder.local`,
      address: parsed.address,
      baptism_status: parsed.baptismStatus,
      care_notes: parsed.notes ?? "추가 정보 입력 필요",
    });

    if (error) throw error;
    revalidateAppData();
    return "멤버를 추가했습니다.";
  });
}

export async function updateMember(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");

    const parsed = updateMemberSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      phone: formData.get("phone"),
      groupId: formData.get("groupId"),
      email: formData.get("email"),
      address: formData.get("address"),
      baptismStatus: formData.get("baptismStatus"),
      notes: formData.get("notes"),
      role: formData.get("role"),
      status: formData.get("status"),
    });

    const { error } = await supabase
      .from("members")
      .update({
        name: parsed.name,
        phone: parsed.phone,
        group_id: parsed.groupId,
        role: parsed.role,
        status: parsed.status,
        email: parsed.email,
        address: parsed.address,
        baptism_status: parsed.baptismStatus,
        care_notes: parsed.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);

    if (error) throw error;
    revalidateAppData();
    return "멤버 정보를 저장했습니다.";
  });
}

export async function deactivateMember(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const id = z.string().uuid().parse(formData.get("id"));

    const { error } = await supabase
      .from("members")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    revalidateAppData();
    return "멤버를 비활성화했습니다.";
  });
}

export async function reactivateMember(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const id = z.string().uuid().parse(formData.get("id"));

    const { error } = await supabase
      .from("members")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    revalidateAppData();
    return "멤버를 다시 활성화했습니다.";
  });
}

export async function createGroup(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("groups:write");
    const parsed = groupSchema.parse({
      name: formData.get("name"),
      leaderMemberId: formData.get("leaderMemberId"),
      targetSize: formData.get("targetSize"),
    });

    const { error } = await supabase.from("groups").insert({
      name: parsed.name,
      leader_member_id: parsed.leaderMemberId,
      target_size: parsed.targetSize,
    });

    if (error) throw error;
    revalidateAppData();
    return "소그룹을 추가했습니다.";
  });
}

export async function updateGroup(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("groups:write");
    const parsed = updateGroupSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      leaderMemberId: formData.get("leaderMemberId"),
      targetSize: formData.get("targetSize"),
    });

    const { error } = await supabase
      .from("groups")
      .update({
        name: parsed.name,
        leader_member_id: parsed.leaderMemberId,
        target_size: parsed.targetSize,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);

    if (error) throw error;
    revalidateAppData();
    return "소그룹을 저장했습니다.";
  });
}

export async function toggleAttendance(memberId: string, eventId: string, nextPresent: boolean) {
  const { supabase, currentMember } = await getAuthorizedCurrentMember("attendance:write");

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
  revalidateAppData();
}
