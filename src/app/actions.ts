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

const customFieldDefinitionSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "영문 소문자, 숫자, 밑줄만 사용할 수 있습니다."),
  label: z.string().min(1),
  fieldType: z.enum(["text", "number", "date", "boolean"]),
  isSensitive: z.preprocess((value) => value === "on", z.boolean()),
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
      if (typeof maybeError.message === "string" && maybeError.message.includes("member_custom_field_definitions")) {
        return "이미 사용 중인 커스텀 필드 키입니다.";
      }
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

async function getAuthorizedCurrentMember(
  permission: "members:write" | "groups:write" | "attendance:write" | "roles:manage",
) {
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

function parseCustomFieldValue(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const normalized = String(value).trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return normalized ? normalized : null;
}

function revalidateAppData() {
  revalidatePath("/");
  revalidatePath("/members");
  revalidatePath("/groups");
  revalidatePath("/attendance");
  revalidatePath("/permissions");
  revalidatePath("/audit");
}

async function writeAuditLog({
  supabase,
  action,
  targetTable,
  targetId,
  beforeData,
  afterData,
  metadata,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  action: string;
  targetTable: string;
  targetId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc("record_audit_log", {
    p_action: action,
    p_target_table: targetTable,
    p_target_id: targetId,
    p_before_data: beforeData ?? null,
    p_after_data: afterData ?? null,
    p_metadata: metadata ?? {},
  });

  if (error) throw error;
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

    const insertPayload = {
      name: parsed.name,
      phone: parsed.phone,
      group_id: parsed.groupId,
      role: parsed.role,
      status: parsed.status,
      email: parsed.email ?? `${parsed.name.replace(/\s/g, "").toLowerCase()}-${Date.now()}@placeholder.local`,
      address: parsed.address,
      baptism_status: parsed.baptismStatus,
      care_notes: parsed.notes ?? "추가 정보 입력 필요",
    };

    const { data: inserted, error } = await supabase.from("members").insert(insertPayload).select("*").single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "member.create",
      targetTable: "members",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
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

    const { data: beforeData, error: beforeError } = await supabase
      .from("members")
      .select("*")
      .eq("id", parsed.id)
      .single();

    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
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
      .eq("id", parsed.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "member.update",
      targetTable: "members",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "멤버 정보를 저장했습니다.";
  });
}

export async function updateMemberCustomFields(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const id = z.string().uuid().parse(formData.get("id"));
    const customFields: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("custom_")) continue;
      customFields[key.replace(/^custom_/, "")] = parseCustomFieldValue(value);
    }

    const { data: beforeData, error: beforeError } = await supabase.from("members").select("*").eq("id", id).single();
    if (beforeError) throw beforeError;
    const existingCustomFields =
      beforeData && typeof beforeData === "object" && "custom_fields" in beforeData
        ? ((beforeData.custom_fields as Record<string, unknown> | null) ?? {})
        : {};
    const mergedCustomFields = { ...existingCustomFields, ...customFields };

    const { data: afterData, error } = await supabase
      .from("members")
      .update({ custom_fields: mergedCustomFields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "member.custom_fields.update",
      targetTable: "members",
      targetId: id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    revalidatePath(`/members/${id}`);
    return "커스텀 필드를 저장했습니다.";
  });
}

export async function createCustomFieldDefinition(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = customFieldDefinitionSchema.parse({
      key: formData.get("key"),
      label: formData.get("label"),
      fieldType: formData.get("fieldType"),
      isSensitive: formData.get("isSensitive"),
    });

    const { data: inserted, error } = await supabase
      .from("member_custom_field_definitions")
      .insert({
        key: parsed.key,
        label: parsed.label,
        field_type: parsed.fieldType,
        is_sensitive: parsed.isSensitive,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "custom_field.create",
      targetTable: "member_custom_field_definitions",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
    revalidateAppData();
    return "커스텀 필드를 추가했습니다.";
  });
}

export async function deactivateMember(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const id = z.string().uuid().parse(formData.get("id"));

    const { data: beforeData, error: beforeError } = await supabase.from("members").select("*").eq("id", id).single();
    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("members")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "member.deactivate",
      targetTable: "members",
      targetId: id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "멤버를 비활성화했습니다.";
  });
}

export async function reactivateMember(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const id = z.string().uuid().parse(formData.get("id"));

    const { data: beforeData, error: beforeError } = await supabase.from("members").select("*").eq("id", id).single();
    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("members")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "member.reactivate",
      targetTable: "members",
      targetId: id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
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

    const { data: inserted, error } = await supabase
      .from("groups")
      .insert({
        name: parsed.name,
        leader_member_id: parsed.leaderMemberId,
        target_size: parsed.targetSize,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "group.create",
      targetTable: "groups",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
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

    const { data: beforeData, error: beforeError } = await supabase
      .from("groups")
      .select("*")
      .eq("id", parsed.id)
      .single();

    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("groups")
      .update({
        name: parsed.name,
        leader_member_id: parsed.leaderMemberId,
        target_size: parsed.targetSize,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "group.update",
      targetTable: "groups",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "소그룹을 저장했습니다.";
  });
}

export async function toggleAttendance(memberId: string, eventId: string, nextPresent: boolean) {
  const { supabase, currentMember } = await getAuthorizedCurrentMember("attendance:write");

  const { data: beforeData, error: beforeError } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("event_id", eventId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (beforeError) throw beforeError;

  const { data: afterData, error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        event_id: eventId,
        member_id: memberId,
        status: nextPresent ? "present" : "absent",
        checked_by_member_id: currentMember.id,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "event_id,member_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  await writeAuditLog({
    supabase,
    action: "attendance.toggle",
    targetTable: "attendance_records",
    targetId: afterData.id as string,
    beforeData: beforeData as Record<string, unknown> | null,
    afterData: afterData as Record<string, unknown>,
    metadata: { eventId, memberId, nextPresent },
  });
  revalidateAppData();
}
