"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac";
import { getOrCreateCurrentMember } from "@/lib/supabase/data";
import { getRoleChangeBlockReason } from "@/lib/role-policy";

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

const mergeMemberAccountSchema = z.object({
  targetMemberId: z.string().uuid(),
  duplicateMemberId: z.string().uuid(),
});

const mergeChoice = z.enum(["survivor", "source"]);

const mergeMemberProfileSchema = z.object({
  survivorMemberId: z.string().uuid(),
  sourceMemberId: z.string().uuid(),
  nameChoice: mergeChoice,
  emailChoice: mergeChoice,
  phoneChoice: mergeChoice,
  groupChoice: mergeChoice,
  statusChoice: mergeChoice,
  addressChoice: mergeChoice,
  baptismChoice: mergeChoice,
  notesChoice: mergeChoice,
});

const updateMemberRoleSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "leader", "staff", "member"]),
});

const deleteMemberSchema = z.object({
  id: z.string().uuid(),
  confirmName: z.string().min(1, "삭제할 멤버 이름을 입력해주세요."),
});

const createMemberLinkRequestSchema = z.object({
  targetMemberId: nullableUuid,
  note: nullableText,
});

const memberLinkRequestDecisionSchema = z.object({
  id: z.string().uuid(),
  targetMemberId: nullableUuid.optional(),
  createTargetMode: z.enum(["existing", "new"]).optional(),
  newMemberName: nullableText.optional(),
  newMemberEmail: nullableText.optional(),
  newMemberPhone: nullableText.optional(),
  newMemberGroupId: nullableUuid.optional(),
});

const groupSchema = z.object({
  name: z.string().min(1),
  leaderMemberId: nullableUuid,
});

const updateGroupSchema = groupSchema.extend({
  id: z.string().uuid(),
});

const attendanceEventSchema = z.object({
  eventDate: z.string().min(1, "날짜를 선택해주세요."),
  title: z.string().min(1, "이벤트 이름을 입력해주세요."),
});

const attendanceReasonSchema = z
  .object({
    memberId: z.string().uuid(),
    eventId: z.string().uuid(),
    note: nullableText,
    excuseStartDate: nullableText,
    excuseEndDate: nullableText,
  })
  .refine(
    (value) => {
      if (!value.excuseStartDate || !value.excuseEndDate) return true;
      return value.excuseStartDate <= value.excuseEndDate;
    },
    { message: "종료일은 시작일 이후여야 합니다." },
  );

function normalizeCustomFieldKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const customFieldKey = z.preprocess(
  normalizeCustomFieldKey,
  z
    .string()
    .min(1, "항목 이름을 입력해주세요.")
    .regex(/^[\p{L}][\p{L}\p{N}_-]*$/u, "식별 키는 문자로 시작하고 문자, 숫자, 밑줄, 하이픈만 사용할 수 있습니다."),
);

const customFieldDefinitionSchema = z.object({
  key: customFieldKey,
  label: z.string().min(1, "라벨을 입력해주세요."),
  fieldType: z.enum(["text", "number", "date", "boolean"]),
  isSensitive: z.preprocess((value) => value === "on", z.boolean()),
});

const updateCustomFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1, "항목 이름을 입력해주세요."),
  fieldType: z.enum(["text", "number", "date", "boolean"]),
  isSensitive: z.preprocess((value) => value === "on", z.boolean()),
});

const careFollowupSchema = z.object({
  memberId: z.string().uuid(),
  assignedToMemberId: nullableUuid,
  status: z.enum(["needed", "contacted", "prayer", "resolved"]),
  note: z.string().min(1, "팔로업 메모를 입력해주세요."),
});

const updateCareFollowupSchema = careFollowupSchema.extend({
  id: z.string().uuid(),
});

export type ActionState = {
  ok: boolean;
  message: string;
};

const initialErrorMessage = "작업 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

function toActionError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "입력값을 확인해주세요.";
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
  permission: "members:read" | "members:write" | "groups:write" | "attendance:write" | "roles:manage",
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
  revalidatePath("/profile");
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

const rolePriority: Record<"admin" | "leader" | "staff" | "member", number> = {
  admin: 4,
  leader: 3,
  staff: 2,
  member: 1,
};

function higherRole(a: "admin" | "leader" | "staff" | "member", b: "admin" | "leader" | "staff" | "member") {
  return rolePriority[a] >= rolePriority[b] ? a : b;
}

function appendMergeNote(currentNote: unknown, targetName: unknown) {
  const base = typeof currentNote === "string" ? currentNote.trim() : "";
  const mergeNote = `중복 계정 병합됨: ${String(targetName ?? "기존 멤버")}에 Google 계정 연결`;
  return base ? `${base}\n${mergeNote}` : mergeNote;
}

function chooseMergeValue(choice: "survivor" | "source", survivorValue: unknown, sourceValue: unknown) {
  if (survivorValue === sourceValue) return survivorValue;
  return choice === "source" ? sourceValue : survivorValue;
}

function toRole(value: unknown) {
  return String(value ?? "member") as "admin" | "leader" | "staff" | "member";
}

function mergeCustomFields(survivorMember: Record<string, unknown>, sourceMember: Record<string, unknown>) {
  const survivorFields =
    survivorMember.custom_fields && typeof survivorMember.custom_fields === "object"
      ? (survivorMember.custom_fields as Record<string, unknown>)
      : {};
  const sourceFields =
    sourceMember.custom_fields && typeof sourceMember.custom_fields === "object"
      ? (sourceMember.custom_fields as Record<string, unknown>)
      : {};

  return {
    ...sourceFields,
    ...survivorFields,
    google_account_name: survivorMember.name ?? null,
    merged_source_member_id: sourceMember.id,
    merged_source_member_name: sourceMember.name ?? null,
  };
}

function makeMergedPlaceholderEmail(memberId: unknown) {
  return `${String(memberId)}@merged.local`;
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

export async function mergeMemberAccount(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const parsed = mergeMemberAccountSchema.parse({
      targetMemberId: formData.get("targetMemberId"),
      duplicateMemberId: formData.get("duplicateMemberId"),
    });

    if (parsed.targetMemberId === parsed.duplicateMemberId) {
      throw new Error("서로 다른 멤버를 선택해주세요.");
    }

    const { data: rows, error: rowsError } = await supabase
      .from("members")
      .select("*")
      .in("id", [parsed.targetMemberId, parsed.duplicateMemberId]);

    if (rowsError) throw rowsError;

    const members = (rows ?? []) as Array<Record<string, unknown>>;
    const targetMember = members.find((member) => member.id === parsed.targetMemberId);
    const duplicateMember = members.find((member) => member.id === parsed.duplicateMemberId);

    if (!targetMember || !duplicateMember) throw new Error("멤버 정보를 찾을 수 없습니다.");
    if (targetMember.auth_user_id) throw new Error("기존 멤버에 이미 Google 계정이 연결되어 있습니다.");
    if (!duplicateMember.auth_user_id) throw new Error("연결할 Google 계정이 있는 중복 멤버를 선택해주세요.");

    const now = new Date().toISOString();
    const duplicateAuthUserId = String(duplicateMember.auth_user_id);
    const targetRole = higherRole(
      String(targetMember.role ?? "member") as "admin" | "leader" | "staff" | "member",
      String(duplicateMember.role ?? "member") as "admin" | "leader" | "staff" | "member",
    );

    const { data: deactivatedDuplicate, error: duplicateError } = await supabase
      .from("members")
      .update({
        auth_user_id: null,
        status: "inactive",
        care_notes: appendMergeNote(duplicateMember.care_notes, targetMember.name),
        updated_at: now,
      })
      .eq("id", parsed.duplicateMemberId)
      .select("*")
      .single();

    if (duplicateError) throw duplicateError;

    const { data: updatedTarget, error: targetError } = await supabase
      .from("members")
      .update({
        auth_user_id: duplicateAuthUserId,
        role: targetRole,
        updated_at: now,
      })
      .eq("id", parsed.targetMemberId)
      .is("auth_user_id", null)
      .select("*")
      .single();

    if (targetError) {
      await supabase
        .from("members")
        .update({
          auth_user_id: duplicateAuthUserId,
          status: duplicateMember.status,
          care_notes: duplicateMember.care_notes,
          updated_at: now,
        })
        .eq("id", parsed.duplicateMemberId);
      throw targetError;
    }

    await writeAuditLog({
      supabase,
      action: "member.account_merge",
      targetTable: "members",
      targetId: parsed.targetMemberId,
      beforeData: {
        targetMember,
        duplicateMember,
      },
      afterData: {
        targetMember: updatedTarget as Record<string, unknown>,
        duplicateMember: deactivatedDuplicate as Record<string, unknown>,
      },
      metadata: {
        duplicateMemberId: parsed.duplicateMemberId,
      },
    });
    revalidateAppData();
    return "Google 계정을 기존 멤버에 연결하고 중복 멤버를 비활성화했습니다.";
  });
}

export async function mergeMemberProfile(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = mergeMemberProfileSchema.parse({
      survivorMemberId: formData.get("survivorMemberId"),
      sourceMemberId: formData.get("sourceMemberId"),
      nameChoice: formData.get("nameChoice"),
      emailChoice: formData.get("emailChoice"),
      phoneChoice: formData.get("phoneChoice"),
      groupChoice: formData.get("groupChoice"),
      statusChoice: formData.get("statusChoice"),
      addressChoice: formData.get("addressChoice"),
      baptismChoice: formData.get("baptismChoice"),
      notesChoice: formData.get("notesChoice"),
    });

    if (parsed.survivorMemberId === parsed.sourceMemberId) {
      throw new Error("서로 다른 멤버를 선택해주세요.");
    }

    const { data: rows, error: rowsError } = await supabase
      .from("members")
      .select("*")
      .in("id", [parsed.survivorMemberId, parsed.sourceMemberId]);

    if (rowsError) throw rowsError;

    const members = (rows ?? []) as Array<Record<string, unknown>>;
    const survivorMember = members.find((member) => member.id === parsed.survivorMemberId);
    const sourceMember = members.find((member) => member.id === parsed.sourceMemberId);

    if (!survivorMember || !sourceMember) throw new Error("멤버 정보를 찾을 수 없습니다.");
    if (!survivorMember.auth_user_id) throw new Error("살아남을 멤버에는 Google 계정이 연결되어 있어야 합니다.");
    if (sourceMember.auth_user_id) throw new Error("흡수할 교적 멤버에는 Google 계정이 연결되어 있지 않아야 합니다.");

    const now = new Date().toISOString();
    const selectedEmail = chooseMergeValue(parsed.emailChoice, survivorMember.email, sourceMember.email) ?? null;
    const sourceEmailAfterMerge =
      typeof sourceMember.email === "string" && sourceMember.email.length > 0
        ? makeMergedPlaceholderEmail(sourceMember.id)
        : null;
    const survivorPayload = {
      name: chooseMergeValue(parsed.nameChoice, survivorMember.name, sourceMember.name),
      email: selectedEmail,
      phone: chooseMergeValue(parsed.phoneChoice, survivorMember.phone, sourceMember.phone),
      group_id: chooseMergeValue(parsed.groupChoice, survivorMember.group_id, sourceMember.group_id),
      status: chooseMergeValue(parsed.statusChoice, survivorMember.status, sourceMember.status),
      address: chooseMergeValue(parsed.addressChoice, survivorMember.address, sourceMember.address),
      baptism_status: chooseMergeValue(parsed.baptismChoice, survivorMember.baptism_status, sourceMember.baptism_status),
      care_notes: chooseMergeValue(parsed.notesChoice, survivorMember.care_notes, sourceMember.care_notes),
      role: higherRole(toRole(survivorMember.role), toRole(sourceMember.role)),
      custom_fields: mergeCustomFields(survivorMember, sourceMember),
      updated_at: now,
    };

    const { data: conflictingEmailOwner, error: conflictError } =
      typeof selectedEmail === "string" && selectedEmail.length > 0
        ? await supabase.from("members").select("id").eq("email", selectedEmail).neq("id", parsed.survivorMemberId).maybeSingle()
        : { data: null, error: null };

    if (conflictError) throw conflictError;

    if (conflictingEmailOwner) {
      const { error: releaseEmailError } = await supabase
        .from("members")
        .update({ email: makeMergedPlaceholderEmail(conflictingEmailOwner.id), updated_at: now })
        .eq("id", conflictingEmailOwner.id);

      if (releaseEmailError) throw releaseEmailError;
    }

    const { data: deactivatedSource, error: sourceError } = await supabase
      .from("members")
      .update({
        auth_user_id: null,
        status: "inactive",
        email: sourceEmailAfterMerge,
        care_notes: appendMergeNote(sourceMember.care_notes, survivorPayload.name),
        updated_at: now,
      })
      .eq("id", parsed.sourceMemberId)
      .is("auth_user_id", null)
      .select("*")
      .single();

    if (sourceError) throw sourceError;

    const { data: updatedSurvivor, error: survivorError } = await supabase
      .from("members")
      .update(survivorPayload)
      .eq("id", parsed.survivorMemberId)
      .select("*")
      .single();

    if (survivorError) {
      await supabase
        .from("members")
        .update({
          status: sourceMember.status,
          email: sourceMember.email,
          care_notes: sourceMember.care_notes,
          updated_at: now,
        })
        .eq("id", parsed.sourceMemberId);
      throw survivorError;
    }

    await writeAuditLog({
      supabase,
      action: "member.profile_merge",
      targetTable: "members",
      targetId: parsed.survivorMemberId,
      beforeData: {
        survivorMember,
        sourceMember,
      },
      afterData: {
        survivorMember: updatedSurvivor as Record<string, unknown>,
        sourceMember: deactivatedSource as Record<string, unknown>,
      },
      metadata: {
        sourceMemberId: parsed.sourceMemberId,
        choices: {
          name: parsed.nameChoice,
          email: parsed.emailChoice,
          phone: parsed.phoneChoice,
          group: parsed.groupChoice,
          status: parsed.statusChoice,
          address: parsed.addressChoice,
          baptism: parsed.baptismChoice,
          notes: parsed.notesChoice,
        },
      },
    });
    revalidateAppData();
    return "Google 계정 멤버에 교적 정보를 병합했습니다.";
  });
}

export async function createMemberLinkRequest(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("members:read");
    const parsed = createMemberLinkRequestSchema.parse({
      targetMemberId: formData.get("targetMemberId"),
      note: formData.get("note"),
    });

    if (parsed.targetMemberId === currentMember.id) {
      throw new Error("본인 프로필과 같은 멤버는 선택할 수 없습니다.");
    }

    const { data: existingRequests, error: existingRequestsError } = await supabase
      .from("member_link_requests")
      .select("id, status")
      .eq("requester_member_id", currentMember.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingRequestsError) throw existingRequestsError;

    const latestRequest = existingRequests?.[0];
    if (latestRequest?.status === "pending") {
      throw new Error("이미 교적 연결 요청을 보냈습니다. 관리자의 승인을 기다려주세요.");
    }
    if (latestRequest?.status === "rejected") {
      throw new Error("교적 연결 요청이 거절되었습니다. Newave 운영 관리자에게 직접 연락해주세요.");
    }

    if (parsed.targetMemberId) {
      const { data: targetMember, error: targetError } = await supabase
        .from("members")
        .select("id, auth_user_id, status")
        .eq("id", parsed.targetMemberId)
        .single();

      if (targetError) throw targetError;
      if (targetMember.auth_user_id) throw new Error("이미 Google 계정이 연결된 멤버입니다.");
      if (targetMember.status === "inactive") throw new Error("비활성화된 멤버에는 연결 요청을 만들 수 없습니다.");
    }

    const { data: inserted, error } = await supabase
      .from("member_link_requests")
      .insert({
        requester_member_id: currentMember.id,
        target_member_id: parsed.targetMemberId,
        note: parsed.note,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "member_link_request.create",
      targetTable: "member_link_requests",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
    revalidateAppData();
    return "교적 연결 요청을 보냈습니다. 관리자가 확인하면 내 프로필에 반영됩니다.";
  });
}

export async function approveMemberLinkRequest(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = memberLinkRequestDecisionSchema.parse({
      id: formData.get("id"),
      targetMemberId: formData.get("targetMemberId"),
      createTargetMode: formData.get("createTargetMode") || "existing",
      newMemberName: formData.get("newMemberName"),
      newMemberEmail: formData.get("newMemberEmail"),
      newMemberPhone: formData.get("newMemberPhone"),
      newMemberGroupId: formData.get("newMemberGroupId"),
    });

    const { data: request, error: requestError } = await supabase
      .from("member_link_requests")
      .select("*")
      .eq("id", parsed.id)
      .eq("status", "pending")
      .single();

    if (requestError) throw requestError;
    let targetMemberId = (request.target_member_id as string | null) ?? null;

    if (!targetMemberId && parsed.createTargetMode === "new") {
      if (!parsed.newMemberName) throw new Error("새 교적 이름을 입력해주세요.");

      const { data: newMember, error: newMemberError } = await supabase
        .from("members")
        .insert({
          name: parsed.newMemberName,
          email: parsed.newMemberEmail,
          phone: parsed.newMemberPhone,
          group_id: parsed.newMemberGroupId,
          role: "member",
          status: "active",
        })
        .select("id")
        .single();

      if (newMemberError) throw newMemberError;
      targetMemberId = newMember.id as string;

      await writeAuditLog({
        supabase,
        action: "member.create_for_link_request",
        targetTable: "members",
        targetId: targetMemberId,
        afterData: newMember as Record<string, unknown>,
        metadata: { linkRequestId: parsed.id },
      });
    }

    if (!targetMemberId) {
      targetMemberId = parsed.targetMemberId ?? null;
    }

    if (!targetMemberId) {
      throw new Error("연결할 교적 멤버를 선택해주세요.");
    }

    const mergeFormData = new FormData();
    mergeFormData.set("survivorMemberId", request.requester_member_id as string);
    mergeFormData.set("sourceMemberId", targetMemberId);
    mergeFormData.set("nameChoice", "source");
    mergeFormData.set("emailChoice", "survivor");
    mergeFormData.set("phoneChoice", "source");
    mergeFormData.set("groupChoice", "source");
    mergeFormData.set("statusChoice", "source");
    mergeFormData.set("addressChoice", "source");
    mergeFormData.set("baptismChoice", "source");
    mergeFormData.set("notesChoice", "source");

    const mergeResult = await mergeMemberProfile(_previousState, mergeFormData);
    if (!mergeResult.ok) throw new Error(mergeResult.message);

    const { error: roleResetError } = await supabase
      .from("members")
      .update({ role: "member", updated_at: new Date().toISOString() })
      .eq("id", request.requester_member_id as string);

    if (roleResetError) throw roleResetError;

    const approvedAt = new Date().toISOString();
    const approvedPayload = {
      status: "approved",
      resolved_at: approvedAt,
      resolved_by_member_id: currentMember.id,
    };
    const { count: approvedCount, error: updateError } = await supabase
      .from("member_link_requests")
      .update(approvedPayload, { count: "exact" })
      .eq("id", parsed.id)
      .eq("status", "pending");

    if (updateError) throw updateError;
    if (approvedCount === 0) throw new Error("이미 처리되었거나 찾을 수 없는 요청입니다.");
    await writeAuditLog({
      supabase,
      action: "member_link_request.approve",
      targetTable: "member_link_requests",
      targetId: parsed.id,
      afterData: {
        id: parsed.id,
        ...approvedPayload,
      },
    });
    revalidateAppData();
    return "교적 연결 요청을 승인했습니다.";
  });
}

export async function rejectMemberLinkRequest(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = memberLinkRequestDecisionSchema.parse({ id: formData.get("id") });

    const { data: existingRequest, error: existingRequestError } = await supabase
      .from("member_link_requests")
      .select("*")
      .eq("id", parsed.id)
      .maybeSingle();

    if (existingRequestError) throw existingRequestError;

    const rejectedAt = new Date().toISOString();
    const rejectedPayload = {
      status: "rejected",
      resolved_at: rejectedAt,
      resolved_by_member_id: currentMember.id,
    };
    const { count: rejectedCount, error } = await supabase
      .from("member_link_requests")
      .update(rejectedPayload, { count: "exact" })
      .eq("id", parsed.id);

    if (error) throw error;
    if (rejectedCount === 0) {
      revalidateAppData();
      return "요청이 이미 정리되었습니다.";
    }
    await writeAuditLog({
      supabase,
      action: "member_link_request.reject",
      targetTable: "member_link_requests",
      targetId: parsed.id,
      beforeData: (existingRequest as Record<string, unknown> | null) ?? null,
      afterData: {
        id: parsed.id,
        ...rejectedPayload,
      },
    });
    revalidateAppData();
    return "교적 연결 요청을 거절했습니다.";
  });
}

export async function updateMemberRole(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = updateMemberRoleSchema.parse({
      id: formData.get("id"),
      role: formData.get("role"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("members")
      .select("*")
      .eq("id", parsed.id)
      .single();

    if (beforeError) throw beforeError;

    const { count: activeAdminCount, error: countError } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .neq("status", "inactive");

    if (countError) throw countError;

    const blockReason = getRoleChangeBlockReason({
      targetCurrentRole: beforeData.role,
      nextRole: parsed.role,
      activeAdminCount: activeAdminCount ?? 0,
    });

    if (blockReason) throw new Error(blockReason);

    const { data: afterData, error } = await supabase
      .from("members")
      .update({
        role: parsed.role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "member.role.update",
      targetTable: "members",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "멤버 역할을 변경했습니다.";
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
    const label = String(formData.get("label") ?? "").trim();
    const keyInput = String(formData.get("key") ?? "").trim();
    const parsed = customFieldDefinitionSchema.parse({
      key: keyInput || label,
      label,
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

export async function updateCustomFieldDefinition(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = updateCustomFieldDefinitionSchema.parse({
      id: formData.get("id"),
      label: formData.get("label"),
      fieldType: formData.get("fieldType"),
      isSensitive: formData.get("isSensitive"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("member_custom_field_definitions")
      .select("*")
      .eq("id", parsed.id)
      .single();

    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("member_custom_field_definitions")
      .update({
        label: parsed.label,
        field_type: parsed.fieldType,
        is_sensitive: parsed.isSensitive,
      })
      .eq("id", parsed.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "custom_field.update",
      targetTable: "member_custom_field_definitions",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "정보 항목을 수정했습니다.";
  });
}

export async function deleteCustomFieldDefinition(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("roles:manage");
    const id = z.string().uuid().parse(formData.get("id"));

    const { data: beforeData, error: beforeError } = await supabase
      .from("member_custom_field_definitions")
      .select("*")
      .eq("id", id)
      .single();

    if (beforeError) throw beforeError;

    const { error } = await supabase.from("member_custom_field_definitions").delete().eq("id", id);

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "custom_field.delete",
      targetTable: "member_custom_field_definitions",
      targetId: id,
      beforeData: beforeData as Record<string, unknown>,
    });
    revalidateAppData();
    return "정보 항목을 삭제했습니다.";
  });
}

export async function createAttendanceEvent(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("attendance:write");
    const parsed = attendanceEventSchema.parse({
      eventDate: formData.get("eventDate"),
      title: formData.get("title"),
    });

    const { data: inserted, error } = await supabase
      .from("attendance_events")
      .insert({
        event_date: parsed.eventDate,
        title: parsed.title,
        created_by_member_id: currentMember.id,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "attendance_event.create",
      targetTable: "attendance_events",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
    revalidateAppData();
    return "출석 이벤트를 만들었습니다.";
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

export async function deleteMemberPermanently(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = deleteMemberSchema.parse({
      id: formData.get("id"),
      confirmName: formData.get("confirmName"),
    });

    const { data: beforeData, error: beforeError } = await supabase.from("members").select("*").eq("id", parsed.id).single();
    if (beforeError) throw beforeError;

    const member = beforeData as Record<string, unknown>;
    const memberName = String(member.name ?? "");
    if (parsed.confirmName.trim() !== memberName) {
      throw new Error("삭제 확인 이름이 멤버 이름과 일치하지 않습니다.");
    }

    const [{ count: attendanceCount, error: attendanceError }, { count: careCount, error: careError }, { count: linkCount, error: linkError }] =
      await Promise.all([
        supabase.from("attendance_records").select("id", { count: "exact", head: true }).eq("member_id", parsed.id),
        supabase.from("care_followups").select("id", { count: "exact", head: true }).eq("member_id", parsed.id),
        supabase
          .from("member_link_requests")
          .select("id", { count: "exact", head: true })
          .or(`requester_member_id.eq.${parsed.id},target_member_id.eq.${parsed.id}`),
      ]);

    if (attendanceError) throw attendanceError;
    if (careError) throw careError;
    if (linkError) throw linkError;

    const closedAt = new Date().toISOString();
    const { count: closedLinkRequestCount, error: closeLinkRequestsError } = await supabase
      .from("member_link_requests")
      .update(
        {
          status: "rejected",
          resolved_at: closedAt,
          resolved_by_member_id: null,
        },
        { count: "exact" },
      )
      .or(`requester_member_id.eq.${parsed.id},target_member_id.eq.${parsed.id}`)
      .eq("status", "pending");

    if (closeLinkRequestsError) throw closeLinkRequestsError;

    await writeAuditLog({
      supabase,
      action: "member.permanent_delete",
      targetTable: "members",
      targetId: parsed.id,
      beforeData: member,
      metadata: {
        deletedMemberName: memberName,
        deletedMemberEmail: member.email ?? null,
        deletedAuthUserId: member.auth_user_id ?? null,
        cascadingRecords: {
          attendanceRecords: attendanceCount ?? 0,
          careFollowups: careCount ?? 0,
          memberLinkRequests: linkCount ?? 0,
          closedPendingLinkRequests: closedLinkRequestCount ?? 0,
        },
      },
    });

    const { count: deletedCount, error } = await supabase.from("members").delete({ count: "exact" }).eq("id", parsed.id);
    if (error) throw error;
    if (deletedCount !== 1) {
      throw new Error("멤버 삭제 권한이 없거나 이미 삭제된 멤버입니다. 관리자 삭제 정책을 확인해주세요.");
    }

    revalidateAppData();
    return "멤버를 완전히 삭제했습니다. 감사 로그에는 삭제 전 정보가 남아 있습니다.";
  });
}

export async function createGroup(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("groups:write");
    const parsed = groupSchema.parse({
      name: formData.get("name"),
      leaderMemberId: formData.get("leaderMemberId"),
    });

    const { data: inserted, error } = await supabase
      .from("groups")
      .insert({
        name: parsed.name,
        leader_member_id: parsed.leaderMemberId,
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

  const existingReason = beforeData as
    | {
        note?: string | null;
        excuse_start_date?: string | null;
        excuse_end_date?: string | null;
      }
    | null;
  const hasExistingReason = Boolean(
    existingReason?.note || existingReason?.excuse_start_date || existingReason?.excuse_end_date,
  );

  const { data: afterData, error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        event_id: eventId,
        member_id: memberId,
        status: nextPresent ? "present" : hasExistingReason ? "excused" : "absent",
        note: existingReason?.note ?? null,
        excuse_start_date: existingReason?.excuse_start_date ?? null,
        excuse_end_date: existingReason?.excuse_end_date ?? null,
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

export async function updateAttendanceReason(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("attendance:write");
    const parsed = attendanceReasonSchema.parse({
      memberId: formData.get("memberId"),
      eventId: formData.get("eventId"),
      note: formData.get("note"),
      excuseStartDate: formData.get("excuseStartDate"),
      excuseEndDate: formData.get("excuseEndDate"),
    });

    let targetEventIds = [parsed.eventId];

    if (parsed.excuseStartDate && parsed.excuseEndDate) {
      const { data: eventsInRange, error: eventsError } = await supabase
        .from("attendance_events")
        .select("id")
        .gte("event_date", parsed.excuseStartDate)
        .lte("event_date", parsed.excuseEndDate);

      if (eventsError) throw eventsError;
      targetEventIds = (eventsInRange as Array<{ id: string }>).map((event) => event.id);
    }

    if (targetEventIds.length === 0) {
      targetEventIds = [parsed.eventId];
    }

    const { data: beforeData, error: beforeError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("member_id", parsed.memberId)
      .in("event_id", targetEventIds);

    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("attendance_records")
      .upsert(
        targetEventIds.map((eventId) => ({
          event_id: eventId,
          member_id: parsed.memberId,
          status: "excused",
          note: parsed.note,
          excuse_start_date: parsed.excuseStartDate,
          excuse_end_date: parsed.excuseEndDate,
          checked_by_member_id: currentMember.id,
          checked_at: new Date().toISOString(),
        })),
        { onConflict: "event_id,member_id" },
      )
      .select("*");

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "attendance.reason.update",
      targetTable: "attendance_records",
      targetId: ((afterData as Array<{ id: string }> | null)?.[0]?.id ?? parsed.memberId),
      beforeData: { records: beforeData ?? [] },
      afterData: { records: afterData ?? [] },
      metadata: { eventIds: targetEventIds, memberId: parsed.memberId },
    });
    revalidateAppData();
    return `${targetEventIds.length}개 이벤트에 출석 사유를 저장했습니다.`;
  });
}

export async function createCareFollowup(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("members:write");
    const parsed = careFollowupSchema.parse({
      memberId: formData.get("memberId"),
      assignedToMemberId: formData.get("assignedToMemberId"),
      status: formData.get("status"),
      note: formData.get("note"),
    });

    const { data: inserted, error } = await supabase
      .from("care_followups")
      .insert({
        member_id: parsed.memberId,
        assigned_to_member_id: parsed.assignedToMemberId,
        status: parsed.status,
        note: parsed.note,
        created_by_member_id: currentMember.id,
        completed_at: parsed.status === "resolved" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "care_followup.create",
      targetTable: "care_followups",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
      metadata: { memberId: parsed.memberId },
    });
    revalidateAppData();
    revalidatePath(`/members/${parsed.memberId}`);
    return "돌봄 팔로업을 추가했습니다.";
  });
}

export async function updateCareFollowup(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const parsed = updateCareFollowupSchema.parse({
      id: formData.get("id"),
      memberId: formData.get("memberId"),
      assignedToMemberId: formData.get("assignedToMemberId"),
      status: formData.get("status"),
      note: formData.get("note"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("care_followups")
      .select("*")
      .eq("id", parsed.id)
      .eq("member_id", parsed.memberId)
      .single();

    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("care_followups")
      .update({
        assigned_to_member_id: parsed.assignedToMemberId,
        status: parsed.status,
        note: parsed.note,
        completed_at: parsed.status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.id)
      .eq("member_id", parsed.memberId)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "care_followup.update",
      targetTable: "care_followups",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
      metadata: { memberId: parsed.memberId },
    });
    revalidateAppData();
    revalidatePath(`/members/${parsed.memberId}`);
    return "돌봄 팔로업을 저장했습니다.";
  });
}
