"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, type Role } from "@/lib/rbac";
import { getOrCreateCurrentMember } from "@/lib/supabase/data";
import { canDeleteMemberRole, canUseDeleteActions, getRoleChangeBlockReason } from "@/lib/role-policy";
import { replaceGoogleSheetValues } from "@/lib/google-sheets";
import { syncNewFamilyApplicantsFromSheet } from "@/lib/new-family-sync";
import {
  calculateKoreanAge,
  normalizeBaptismStatus,
  normalizeJobValue,
  normalizeMinistryList,
  normalizeMinistryValue,
} from "@/lib/member-field-options";
import { splitCompositeMemberName } from "@/lib/member-names";

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
  englishName: nullableText,
  communityLeaderRole: z.enum(["", "clergy", "team_leader", "elder", "deaconess"]).optional(),
  phone: z.string().min(1),
  groupId: nullableUuid,
  email: nullableText,
  address: nullableText,
  baptismStatus: z.preprocess(normalizeBaptismStatus, nullableText),
  notes: nullableText,
  role: z.enum(["owner", "admin", "leader", "staff", "welcome", "member"]),
  status: z.enum(["active", "new", "care", "inactive"]),
});

const updateMemberSchema = memberSchema.extend({
  id: z.string().uuid(),
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
  role: z.enum(["owner", "admin", "leader", "staff", "welcome", "member"]),
});

const deleteMemberSchema = z.object({
  id: z.string().uuid(),
  confirmName: z.string().min(1, "삭제할 멤버 이름을 입력해주세요."),
});

const restoreDeletedAuthUserSchema = z.object({
  authUserId: z.string().uuid(),
});

const requestDeletedAuthUserRestoreSchema = z.object({
  note: nullableText,
});

const importantLinkSchema = z.object({
  title: z.string().trim().min(1, "링크 이름을 입력해주세요."),
  description: nullableText,
  url: z.string().trim().url("올바른 URL을 입력해주세요."),
});

const deleteImportantLinkSchema = z.object({
  id: z.string().uuid(),
});

const memberStatusMessageSchema = z.object({
  message: z.string().trim().max(80, "한마디는 80자 이내로 적어주세요."),
});

const adminFeedbackSchema = z.object({
  category: z.enum(["feature", "bug", "question", "other"]),
  title: z.string().trim().min(2, "제목을 2자 이상 입력해주세요.").max(80, "제목은 80자 이내로 적어주세요."),
  message: z.string().trim().min(5, "내용을 5자 이상 입력해주세요.").max(1000, "내용은 1000자 이내로 적어주세요."),
});

const attendanceExtraCountSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "출석 날짜를 확인해주세요."),
  visitorCount: z.coerce.number().int().min(0).max(9999),
  newFamilyCount: z.coerce.number().int().min(0).max(9999),
});

const leaderExtraAttendanceSchema = z.object({
  memberId: z.string().uuid(),
  eventId: z.string().uuid(),
  nextPresent: z.boolean(),
});

const updateAdminFeedbackSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "reviewing", "resolved", "closed"]),
  adminNote: nullableText,
});

const updateNewFamilyApplicantSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "week_1", "week_2", "week_3", "completed", "archived"]),
  expectedGroup: nullableText,
  memo: nullableText,
});

const convertNewFamilyApplicantSchema = z.object({
  id: z.string().uuid(),
  groupId: nullableUuid,
});

function pickNewFamilySourceValue(sourceData: unknown, keys: string[]) {
  if (!sourceData || typeof sourceData !== "object" || Array.isArray(sourceData)) return null;
  const record = sourceData as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

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
  isTestAccount: z.boolean().optional(),
});

const groupSchema = z.object({
  name: z.string().min(1),
  leaderMemberId: nullableUuid,
});

const updateGroupSchema = groupSchema.extend({
  id: z.string().uuid(),
});

const renameGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "순 이름을 입력해주세요."),
});

const deleteGroupSchema = z.object({
  id: z.string().uuid(),
});

const attendanceEventTitles = ["주일 예배", "순모임"] as const;
const communityLeaderGroupName = "공동체 리더";

const attendanceEventSchema = z.object({
  eventDate: z.string().min(1, "날짜를 선택해주세요."),
  titles: z.array(z.enum(attendanceEventTitles)).min(1, "이벤트 종류를 하나 이상 선택해주세요."),
});

const deleteAttendanceEventSchema = z.object({
  id: z.string().uuid(),
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

const internalCustomFieldKeys = new Set(["google_account_name", "google_account_email", "onboarding_status", "merged_source_member_id"]);

const updateCareFollowupSchema = careFollowupSchema.extend({
  id: z.string().uuid(),
});

export type ActionState = {
  ok: boolean;
  message: string;
  data?: Record<string, string | number | boolean | null>;
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

async function runAction(
  callback: () => Promise<string | { message: string; data?: ActionState["data"] }>,
): Promise<ActionState> {
  try {
    const result = await callback();
    if (typeof result === "string") {
      return { ok: true, message: result };
    }
    return { ok: true, message: result.message, data: result.data };
  } catch (error) {
    return { ok: false, message: toActionError(error) };
  }
}

async function getAuthorizedCurrentMember(
  permission:
    | "members:read"
    | "members:write"
    | "groups:write"
    | "attendance:write"
    | "attendance:extras:write"
    | "roles:manage"
    | "owner:manage"
    | "links:write"
    | "new-family:write",
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

function normalizeSubmittedCustomFields(customFields: Record<string, unknown>) {
  const normalized = { ...customFields };

  if ("job" in normalized) {
    normalized.job = normalizeJobValue(normalized.job);
  }
  if ("ministry_1" in normalized) {
    normalized.ministry_1 = normalizeMinistryValue(normalized.ministry_1);
  }
  if ("ministry_2" in normalized) {
    normalized.ministry_2 = normalizeMinistryValue(normalized.ministry_2);
  }
  if ("ministries" in normalized) {
    const ministries = normalizeMinistryList(normalized.ministries);
    normalized.ministries = ministries;
    normalized.ministry_1 = ministries[0] ?? null;
    normalized.ministry_2 = ministries[1] ?? null;
  }
  if ("birthdate" in normalized || "age" in normalized) {
    normalized.age = calculateKoreanAge(normalized.birthdate);
  }

  return normalized;
}

function formatSheetValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function revalidateAppData() {
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/members");
  revalidatePath("/groups");
  revalidatePath("/attendance");
  revalidatePath("/links");
  revalidatePath("/feedback");
  revalidatePath("/new-family");
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
  targetId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc("record_audit_log", {
    p_action: action,
    p_target_table: targetTable,
    p_target_id: targetId ?? null,
    p_before_data: beforeData ?? null,
    p_after_data: afterData ?? null,
    p_metadata: metadata ?? {},
  });

  if (error) throw error;
}

const rolePriority: Record<Role, number> = {
  owner: 5,
  admin: 4,
  leader: 3,
  staff: 3,
  welcome: 1,
  member: 1,
};

function higherRole(a: Role, b: Role) {
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
  return String(value ?? "member") as Role;
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
    const { supabase, currentMember } = await getAuthorizedCurrentMember("members:write");

    const parsed = memberSchema.parse({
      name: formData.get("name"),
      englishName: formData.get("englishName"),
      communityLeaderRole: formData.get("communityLeaderRole") ?? "",
      phone: formData.get("phone"),
      groupId: formData.get("groupId"),
      email: formData.get("email"),
      address: formData.get("address"),
      baptismStatus: formData.get("baptismStatus"),
      notes: formData.get("notes"),
      role: formData.get("role") || "member",
      status: formData.get("status"),
    });
    const canManageRoles = hasPermission(currentMember.role, "roles:manage");
    const isTestAccount = canManageRoles && formData.get("isTestAccount") === "on";

    const requestedRole = parsed.role;
    const splitName = splitCompositeMemberName(parsed.name);
    const englishName = parsed.englishName ?? splitName.englishName;
    if (requestedRole === "owner" && !hasPermission(currentMember.role, "owner:manage")) {
      throw new Error("최고 관리자 권한은 최고 관리자만 지정할 수 있습니다.");
    }
    const nextRole = canManageRoles ? requestedRole : "member";

    const insertPayload = {
      name: splitName.koreanName,
      phone: parsed.phone,
      group_id: parsed.groupId,
      role: nextRole,
      status: parsed.status,
      email: parsed.email ?? `${splitName.koreanName.replace(/\s/g, "").toLowerCase()}-${Date.now()}@placeholder.local`,
      address: parsed.address,
      baptism_status: parsed.baptismStatus,
      care_notes: parsed.notes ?? "추가 정보 입력 필요",
      custom_fields: normalizeSubmittedCustomFields({
        ...(englishName ? { english_name: englishName } : {}),
        ...(parsed.communityLeaderRole ? { community_leader_role: parsed.communityLeaderRole } : {}),
        ...(isTestAccount ? { test_account: true } : {}),
      }),
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
    const { supabase, currentMember } = await getAuthorizedCurrentMember("members:read");
    const id = z.string().uuid().parse(formData.get("id"));

    const { data: beforeData, error: beforeError } = await supabase
      .from("members")
      .select("*")
      .eq("id", id)
      .single();

    if (beforeError) throw beforeError;

    const parsed = updateMemberSchema.parse({
      id,
      name: formData.get("name"),
      englishName: formData.get("englishName"),
      communityLeaderRole: formData.get("communityLeaderRole") ?? "",
      phone: formData.get("phone"),
      groupId: formData.has("groupId") ? formData.get("groupId") : beforeData.group_id,
      email: formData.get("email"),
      address: formData.get("address"),
      baptismStatus: formData.get("baptismStatus"),
      notes: formData.get("notes"),
      role: formData.has("role") ? formData.get("role") : beforeData.role,
      status: formData.has("status") ? formData.get("status") : beforeData.status,
    });
    const isOwnProfileUpdate = currentMember.id === parsed.id;
    const canManageMembers = hasPermission(currentMember.role, "members:write");
    if (!canManageMembers && !isOwnProfileUpdate) {
      throw new Error("본인 프로필만 수정할 수 있습니다.");
    }
    const canManageRoles = hasPermission(currentMember.role, "roles:manage");
    const splitName = splitCompositeMemberName(parsed.name);
    const existingCustomFields =
      beforeData && typeof beforeData === "object" && "custom_fields" in beforeData
        ? ((beforeData.custom_fields as Record<string, unknown> | null) ?? {})
        : {};
    const nextEnglishName = parsed.englishName ?? splitName.englishName;
    const nextCustomFields = normalizeSubmittedCustomFields({
      ...existingCustomFields,
      english_name: nextEnglishName,
      community_leader_role: canManageMembers
        ? parsed.communityLeaderRole || undefined
        : existingCustomFields.community_leader_role,
      ...(canManageRoles
        ? formData.get("isTestAccount") === "on"
          ? { test_account: true }
          : { test_account: undefined }
        : {}),
      ...(canManageMembers && formData.has("custom_ministries")
        ? { ministries: formData.getAll("custom_ministries").map((value) => String(value)) }
        : {}),
    });
    const currentRole = beforeData.role as Role;
    const requestedRole = parsed.role as Role;
    if ((currentRole === "owner" || requestedRole === "owner") && !hasPermission(currentMember.role, "owner:manage")) {
      throw new Error("최고 관리자 권한은 최고 관리자만 변경할 수 있습니다.");
    }
    const nextRole = canManageRoles ? requestedRole : currentRole;
    const nextGroupId = canManageMembers ? parsed.groupId : (beforeData.group_id as string | null);
    const nextStatus = canManageMembers ? parsed.status : (beforeData.status as "active" | "new" | "care" | "inactive");
    if (nextRole !== currentRole) {
      const [
        { count: activeAdminCount, error: activeAdminCountError },
        { count: activeOwnerCount, error: activeOwnerCountError },
      ] = await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }).eq("role", "admin").neq("status", "inactive"),
        supabase.from("members").select("id", { count: "exact", head: true }).eq("role", "owner").neq("status", "inactive"),
      ]);

      if (activeAdminCountError) throw activeAdminCountError;
      if (activeOwnerCountError) throw activeOwnerCountError;

      const blockReason = getRoleChangeBlockReason({
        actorRole: currentMember.role,
        targetCurrentRole: currentRole,
        nextRole,
        activeAdminCount: activeAdminCount ?? 0,
        activeOwnerCount: activeOwnerCount ?? 0,
      });

      if (blockReason) throw new Error(blockReason);
    }

    const { data: afterData, error } = await supabase
      .from("members")
      .update({
        name: splitName.koreanName,
        phone: parsed.phone,
        group_id: nextGroupId,
        role: nextRole,
        status: nextStatus,
        email: parsed.email,
        address: parsed.address,
        baptism_status: parsed.baptismStatus,
        care_notes: parsed.notes,
        custom_fields: nextCustomFields,
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

export async function exportMembersToGoogleSheet(_previousState: ActionState, _formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");

    const { data: members, error: membersError } = await supabase
      .from("members")
      .select(
        "id, name, email, phone, address, baptism_status, status, role, custom_fields, groups!members_group_id_fkey(name)",
      )
      .neq("status", "inactive")
      .order("name");

    if (membersError) throw membersError;

    const { data: fieldDefinitions, error: fieldDefinitionsError } = await supabase
      .from("member_custom_field_definitions")
      .select("key, label, is_sensitive")
      .order("label");

    if (fieldDefinitionsError) throw fieldDefinitionsError;

    const safeCustomFieldKeys = new Map<string, string>();
    for (const member of members ?? []) {
      const customFields = (member.custom_fields ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(customFields)) {
        if (internalCustomFieldKeys.has(key)) continue;
        safeCustomFieldKeys.set(key, key);
      }
    }

    for (const field of fieldDefinitions ?? []) {
      if (field.is_sensitive || internalCustomFieldKeys.has(field.key)) {
        safeCustomFieldKeys.delete(field.key);
      } else {
        safeCustomFieldKeys.set(field.key, field.label);
      }
    }

    const customFieldEntries = [...safeCustomFieldKeys.entries()].sort(([, aLabel], [, bLabel]) => aLabel.localeCompare(bLabel));
    const headers = [
      "이름",
      "이메일",
      "전화번호",
      "순",
      "상태",
      "역할",
      "주소",
      "세례/등록",
      ...customFieldEntries.map(([, label]) => label),
    ];

    const rows = [
      headers,
      ...(members ?? []).map((member) => {
        const group = Array.isArray(member.groups) ? member.groups[0] : member.groups;
        const customFields = (member.custom_fields ?? {}) as Record<string, unknown>;
        return [
          member.name ?? "",
          member.email ?? "",
          member.phone ?? "",
          group?.name ?? "",
          member.status ?? "",
          member.role ?? "",
          member.address ?? "",
          normalizeBaptismStatus(member.baptism_status),
          ...customFieldEntries.map(([key]) =>
            key === "age" ? formatSheetValue(calculateKoreanAge(customFields.birthdate)) : formatSheetValue(customFields[key]),
          ),
        ];
      }),
    ];

    const result = await replaceGoogleSheetValues(rows);

    await writeAuditLog({
      supabase,
      action: "members.export_google_sheet",
      targetTable: "members",
      metadata: {
        spreadsheetId: result.spreadsheetId,
        sheetName: result.sheetName,
        rowCount: Math.max(result.updatedRows - 1, 0),
        columnCount: result.updatedColumns,
      },
    });

    return {
      message: `Google Sheet에 교적부 ${Math.max(result.updatedRows - 1, 0)}명을 내보냈습니다.`,
      data: {
        spreadsheetUrl: result.spreadsheetUrl,
        spreadsheetId: result.spreadsheetId,
        sheetName: result.sheetName,
      },
    };
  });
}

export async function syncNewFamilyApplicants(_previousState: ActionState, _formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("new-family:write");
    const result = await syncNewFamilyApplicantsFromSheet(supabase);

    await writeAuditLog({
      supabase,
      action: "new_family.sync_google_sheet",
      targetTable: "new_family_applicants",
      metadata: {
        spreadsheetId: result.spreadsheetId,
        sheetName: result.sheetName,
        rowCount: result.syncedRows,
      },
    });

    revalidateAppData();
    const details =
      result.syncedRows > 0
        ? `${result.sheetName} 탭에서 ${result.readRows}행을 읽고 ${result.syncedRows}건을 동기화했습니다.`
        : `${result.sheetName} 탭에서 ${result.readRows}행을 읽었지만 등록 가능한 새가족 이름을 찾지 못했습니다.`;
    return {
      message: details,
      data: {
        spreadsheetUrl: result.spreadsheetUrl,
        spreadsheetId: result.spreadsheetId,
        sheetName: result.sheetName,
        readRows: result.readRows,
        parsedRows: result.parsedRows,
        skippedRows: result.skippedRows,
        scannedSheetNames: result.scannedSheetNames.join(", "),
      },
    };
  });
}

export async function updateNewFamilyApplicant(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("new-family:write");
    const parsed = updateNewFamilyApplicantSchema.parse({
      id: formData.get("id"),
      status: formData.get("status"),
      expectedGroup: formData.get("expectedGroup"),
      memo: formData.get("memo"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("new_family_applicants")
      .select("*")
      .eq("id", parsed.id)
      .single();
    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("new_family_applicants")
      .update({
        status: parsed.status,
        expected_group: parsed.expectedGroup,
        memo: parsed.memo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id)
      .select("*")
      .single();
    if (error) throw error;

    await writeAuditLog({
      supabase,
      action: "new_family.update",
      targetTable: "new_family_applicants",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });

    revalidateAppData();
    return "새가족 신청 정보를 저장했습니다.";
  });
}

export async function convertNewFamilyApplicantToMember(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("new-family:write");
    const parsed = convertNewFamilyApplicantSchema.parse({
      id: formData.get("id"),
      groupId: formData.get("groupId"),
    });

    const { data: applicant, error: applicantError } = await supabase
      .from("new_family_applicants")
      .select("*")
      .eq("id", parsed.id)
      .single();
    if (applicantError) throw applicantError;
    if (applicant.converted_member_id) throw new Error("이미 멤버로 등록된 새가족입니다.");

    const sourceData = applicant.source_data ?? {};
    const address = pickNewFamilySourceValue(sourceData, ["거주 지역", "주소", "address", "location"]);
    const baptismStatus = normalizeBaptismStatus(pickNewFamilySourceValue(sourceData, ["세례 유무", "세례/등록", "baptismStatus"]));
    const gender = pickNewFamilySourceValue(sourceData, ["성별", "gender"]);
    const birthdate = pickNewFamilySourceValue(sourceData, ["생년월일", "birthdate"]);
    const age = pickNewFamilySourceValue(sourceData, ["만 나이", "age"]);
    const assignee = pickNewFamilySourceValue(sourceData, ["담당자", "assignee", "owner"]);
    const week2AttendanceDate = pickNewFamilySourceValue(sourceData, ["2주차 출석일"]);
    const week3AttendanceDate = pickNewFamilySourceValue(sourceData, ["3주차 출석일"]);
    const completionDueDate = pickNewFamilySourceValue(sourceData, ["수료 예정일"]);
    const expectedGroup = applicant.expected_group || applicant.group_interest || pickNewFamilySourceValue(sourceData, ["예정 순", "희망순", "관심 순", "관심순", "순"]);
    const placeholderEmail = `new-family-${applicant.id}@placeholder.local`;
    const { data: insertedMember, error: insertError } = await supabase
      .from("members")
      .insert({
        name: applicant.name,
        email: applicant.email || placeholderEmail,
        phone: applicant.phone || "미입력",
        group_id: parsed.groupId,
        role: "member",
        status: "new",
        address,
        baptism_status: baptismStatus,
        care_notes: applicant.memo || "새가족 신청에서 멤버로 등록됨",
        custom_fields: {
          source: pickNewFamilySourceValue(sourceData, ["source"]) === "legacy_new_family_csv_2026" ? "legacy_new_family_csv_2026" : "new_family_google_form",
          new_family_applicant_id: applicant.id,
          group_interest: applicant.group_interest,
          expected_group: expectedGroup,
          gender,
          birthdate,
          age,
          new_family_assignee: assignee,
          new_family_week_2_attendance_date: week2AttendanceDate,
          new_family_week_3_attendance_date: week3AttendanceDate,
          new_family_completion_due_date: completionDueDate,
        },
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const convertedAt = new Date().toISOString();
    const { data: updatedApplicant, error: updateError } = await supabase
      .from("new_family_applicants")
      .update({
        status: "completed",
        converted_member_id: insertedMember.id,
        converted_at: convertedAt,
        updated_at: convertedAt,
      })
      .eq("id", parsed.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    await writeAuditLog({
      supabase,
      action: "new_family.convert_to_member",
      targetTable: "new_family_applicants",
      targetId: parsed.id,
      beforeData: applicant as Record<string, unknown>,
      afterData: updatedApplicant as Record<string, unknown>,
      metadata: {
        memberId: insertedMember.id,
      },
    });

    revalidateAppData();
    return "새가족을 멤버 로스터에 등록했습니다.";
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
      isTestAccount: formData.get("isTestAccount") === "on",
    });

    const { data: request, error: requestError } = await supabase
      .from("member_link_requests")
      .select("*")
      .eq("id", parsed.id)
      .eq("status", "pending")
      .single();

    if (requestError) throw requestError;
    let targetMemberId = parsed.createTargetMode === "existing"
      ? parsed.targetMemberId ?? ((request.target_member_id as string | null) ?? null)
      : null;

    if (parsed.createTargetMode === "new") {
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
          custom_fields: parsed.isTestAccount ? { test_account: true } : {},
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
      throw new Error("연결할 교적 멤버를 선택해주세요.");
    }

    if (targetMemberId === (request.requester_member_id as string)) {
      throw new Error("요청자 본인 교적으로는 연결할 수 없습니다.");
    }

    const { data: targetMember, error: targetMemberError } = await supabase
      .from("members")
      .select("id, status, auth_user_id")
      .eq("id", targetMemberId)
      .single();

    if (targetMemberError) throw targetMemberError;
    if (targetMember.status === "inactive") throw new Error("비활성화된 멤버에는 연결할 수 없습니다.");
    if (targetMember.auth_user_id) throw new Error("이미 다른 Google 계정에 연결된 교적입니다.");

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

    if (parsed.isTestAccount) {
      const { data: requesterMember, error: requesterMemberError } = await supabase
        .from("members")
        .select("custom_fields")
        .eq("id", request.requester_member_id as string)
        .single();
      if (requesterMemberError) throw requesterMemberError;

      const requesterCustomFields =
        requesterMember.custom_fields && typeof requesterMember.custom_fields === "object"
          ? (requesterMember.custom_fields as Record<string, unknown>)
          : {};
      const { error: testAccountError } = await supabase
        .from("members")
        .update({
          custom_fields: normalizeSubmittedCustomFields({ ...requesterCustomFields, test_account: true }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.requester_member_id as string);
      if (testAccountError) throw testAccountError;
    }

    const { error: roleResetError } = await supabase
      .from("members")
      .update({ role: "member", updated_at: new Date().toISOString() })
      .eq("id", request.requester_member_id as string);

    if (roleResetError) throw roleResetError;

    const approvedAt = new Date().toISOString();
    const approvedPayload = {
      status: "approved",
      target_member_id: targetMemberId,
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

export async function reopenMemberLinkRequest(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = memberLinkRequestDecisionSchema.parse({ id: formData.get("id") });

    const { data: existingRequest, error: existingRequestError } = await supabase
      .from("member_link_requests")
      .select("*")
      .eq("id", parsed.id)
      .maybeSingle();

    if (existingRequestError) throw existingRequestError;
    if (!existingRequest) throw new Error("찾을 수 없는 요청입니다.");
    if (existingRequest.status === "pending") return "이미 다시 검토 중인 요청입니다.";
    if (existingRequest.status === "approved") throw new Error("이미 승인된 요청은 다시 검토로 돌릴 수 없습니다.");

    const { count: existingPendingCount, error: existingPendingError } = await supabase
      .from("member_link_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_member_id", existingRequest.requester_member_id)
      .eq("status", "pending")
      .neq("id", parsed.id);

    if (existingPendingError) throw existingPendingError;
    if ((existingPendingCount ?? 0) > 0) {
      throw new Error("이 사용자는 이미 다른 교적 연결 요청이 대기 중입니다.");
    }

    const reopenedPayload = {
      status: "pending",
      resolved_at: null,
      resolved_by_member_id: null,
    };
    const { count: reopenedCount, error } = await supabase
      .from("member_link_requests")
      .update(reopenedPayload, { count: "exact" })
      .eq("id", parsed.id)
      .eq("status", "rejected");

    if (error) throw error;
    if (reopenedCount === 0) throw new Error("이미 처리되었거나 찾을 수 없는 요청입니다.");

    await writeAuditLog({
      supabase,
      action: "member_link_request.reopen",
      targetTable: "member_link_requests",
      targetId: parsed.id,
      beforeData: existingRequest as Record<string, unknown>,
      afterData: {
        id: parsed.id,
        ...reopenedPayload,
        reopened_by_member_id: currentMember.id,
      },
    });
    revalidateAppData();
    return "거절된 교적 연결 요청을 다시 검토 상태로 돌렸습니다.";
  });
}

export async function updateMemberRole(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("roles:manage");
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

    const [
      { count: activeAdminCount, error: activeAdminCountError },
      { count: activeOwnerCount, error: activeOwnerCountError },
    ] = await Promise.all([
      supabase.from("members").select("id", { count: "exact", head: true }).eq("role", "admin").neq("status", "inactive"),
      supabase.from("members").select("id", { count: "exact", head: true }).eq("role", "owner").neq("status", "inactive"),
    ]);

    if (activeAdminCountError) throw activeAdminCountError;
    if (activeOwnerCountError) throw activeOwnerCountError;

    const blockReason = getRoleChangeBlockReason({
      actorRole: currentMember.role,
      targetCurrentRole: beforeData.role,
      nextRole: parsed.role,
      activeAdminCount: activeAdminCount ?? 0,
      activeOwnerCount: activeOwnerCount ?? 0,
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
    const { supabase, currentMember } = await getAuthorizedCurrentMember("members:read");
    const id = z.string().uuid().parse(formData.get("id"));
    const customFields: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("custom_")) continue;
      const fieldKey = key.replace(/^custom_/, "");
      const parsedValue = parseCustomFieldValue(value);
      if (fieldKey in customFields) {
        customFields[fieldKey] = [...(Array.isArray(customFields[fieldKey]) ? customFields[fieldKey] : [customFields[fieldKey]]), parsedValue];
      } else {
        customFields[fieldKey] = parsedValue;
      }
    }

    const { data: beforeData, error: beforeError } = await supabase.from("members").select("*").eq("id", id).single();
    if (beforeError) throw beforeError;
    if (!hasPermission(currentMember.role, "members:write") && currentMember.id !== id) {
      throw new Error("본인 추가 정보만 수정할 수 있습니다.");
    }
    const existingCustomFields =
      beforeData && typeof beforeData === "object" && "custom_fields" in beforeData
        ? ((beforeData.custom_fields as Record<string, unknown> | null) ?? {})
        : {};
    const mergedCustomFields = normalizeSubmittedCustomFields({ ...existingCustomFields, ...customFields });

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
    const submittedTitles = formData.getAll("titles");
    const legacyTitle = formData.get("title");
    const parsed = attendanceEventSchema.parse({
      eventDate: formData.get("eventDate"),
      titles: submittedTitles.length > 0 ? submittedTitles : legacyTitle ? [legacyTitle] : ["주일 예배", "순모임"],
    });

    const { data: existingEvents, error: existingEventError } = await supabase
      .from("attendance_events")
      .select("id, title")
      .eq("event_date", parsed.eventDate)
      .in("title", parsed.titles);

    if (existingEventError) throw existingEventError;
    const existingTitles = new Set((existingEvents ?? []).map((event) => String(event.title)));
    const titlesToCreate = parsed.titles.filter((title) => !existingTitles.has(title));

    if (titlesToCreate.length === 0) {
      return "선택한 출석 이벤트가 이미 모두 있습니다.";
    }

    const { data: insertedEvents, error } = await supabase
      .from("attendance_events")
      .insert(titlesToCreate.map((title) => ({
        event_date: parsed.eventDate,
        title,
        created_by_member_id: currentMember.id,
      })))
      .select("*")
      .order("title", { ascending: true });

    if (error) throw error;
    for (const inserted of insertedEvents ?? []) {
      await writeAuditLog({
        supabase,
        action: "attendance_event.create",
        targetTable: "attendance_events",
        targetId: inserted.id as string,
        afterData: inserted as Record<string, unknown>,
      });
    }
    revalidateAppData();
    const skippedCount = parsed.titles.length - titlesToCreate.length;
    return skippedCount > 0
      ? `${titlesToCreate.join(", ")} 이벤트를 만들었습니다. 이미 있던 ${skippedCount}개는 건너뛰었습니다.`
      : `${titlesToCreate.join(", ")} 이벤트를 만들었습니다.`;
  });
}

export async function deleteAttendanceEvent(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("attendance:write");
    if (!canUseDeleteActions(currentMember.role)) {
      throw new Error("삭제 권한이 없습니다.");
    }

    const parsed = deleteAttendanceEventSchema.parse({
      id: formData.get("id"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("attendance_events")
      .select("*")
      .eq("id", parsed.id)
      .single();

    if (beforeError) throw beforeError;

    const { data: pairedEvents, error: pairedEventsError } = await supabase
      .from("attendance_events")
      .select("*")
      .eq("event_date", beforeData.event_date)
      .in("title", attendanceEventTitles);
    if (pairedEventsError) throw pairedEventsError;

    const pairedEventIds = (pairedEvents ?? []).map((event) => event.id as string);
    const deleteIds = pairedEventIds.length > 0 ? pairedEventIds : [parsed.id];
    const { error } = await supabase.from("attendance_events").delete().in("id", deleteIds);
    if (error) throw error;

    await writeAuditLog({
      supabase,
      action: "attendance_event.delete",
      targetTable: "attendance_events",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      metadata: {
        eventDate: beforeData.event_date,
        deletedEventIds: deleteIds,
        deletedEventTitles: (pairedEvents ?? []).map((event) => event.title),
      },
    });
    revalidateAppData();
    return "선택한 날짜의 주일 예배와 순모임 출석 이벤트를 함께 삭제했습니다.";
  });
}

export async function updateAttendanceExtraCounts(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("attendance:extras:write");
    const parsed = attendanceExtraCountSchema.parse({
      eventDate: formData.get("eventDate"),
      visitorCount: formData.get("visitorCount"),
      newFamilyCount: formData.get("newFamilyCount"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("attendance_extra_counts")
      .select("*")
      .eq("event_date", parsed.eventDate)
      .maybeSingle();

    if (beforeError) throw beforeError;

    const { data: afterData, error } = await supabase
      .from("attendance_extra_counts")
      .upsert(
        {
          event_date: parsed.eventDate,
          clergy_count: 0,
          team_leader_count: 0,
          visitor_count: parsed.visitorCount,
          new_family_count: parsed.newFamilyCount,
          updated_by_member_id: currentMember.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_date" },
      )
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditLog({
      supabase,
      action: "attendance_extra_counts.update",
      targetTable: "attendance_extra_counts",
      targetId: parsed.eventDate,
      beforeData: beforeData as Record<string, unknown> | null,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "출석 추가 인원을 저장했습니다.";
  });
}

export async function toggleLeaderExtraAttendance(memberId: string, eventId: string, nextPresent: boolean) {
  const { supabase, currentMember } = await getAuthorizedCurrentMember("attendance:extras:write");
  const parsed = leaderExtraAttendanceSchema.parse({ memberId, eventId, nextPresent });

  const [
    { data: targetEvent, error: targetEventError },
    { data: targetMember, error: targetMemberError },
  ] = await Promise.all([
    supabase.from("attendance_events").select("id, title, event_date").eq("id", parsed.eventId).single(),
    supabase
      .from("members")
      .select("id, group_id, groups!members_group_id_fkey(name)")
      .eq("id", parsed.memberId)
      .neq("status", "inactive")
      .single(),
  ]);

  if (targetEventError) throw targetEventError;
  if (targetMemberError) throw targetMemberError;
  if (targetEvent.title !== "주일 예배") {
    throw new Error("교역자/팀장 이상 출석은 주일 예배에만 체크할 수 있습니다.");
  }

  const group = Array.isArray(targetMember.groups) ? targetMember.groups[0] : targetMember.groups;
  if (!String(group?.name ?? "").includes(communityLeaderGroupName)) {
    throw new Error("공동체 리더 순 멤버만 예배 추가 출석으로 체크할 수 있습니다.");
  }

  const { data: beforeData, error: beforeError } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("event_id", parsed.eventId)
    .eq("member_id", parsed.memberId)
    .maybeSingle();

  if (beforeError) throw beforeError;

  const { data: afterData, error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        event_id: parsed.eventId,
        member_id: parsed.memberId,
        status: parsed.nextPresent ? "present" : "absent",
        note: beforeData?.note ?? null,
        excuse_start_date: beforeData?.excuse_start_date ?? null,
        excuse_end_date: beforeData?.excuse_end_date ?? null,
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
    action: "attendance.extra_leader.toggle",
    targetTable: "attendance_records",
    targetId: afterData.id as string,
    beforeData: beforeData as Record<string, unknown> | null,
    afterData: afterData as Record<string, unknown>,
    metadata: { eventId: parsed.eventId, memberId: parsed.memberId, nextPresent: parsed.nextPresent },
  });
  revalidateAppData();
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
    const { supabase, currentMember } = await getAuthorizedCurrentMember("members:write");
    const parsed = deleteMemberSchema.parse({
      id: formData.get("id"),
      confirmName: formData.get("confirmName"),
    });

    const { data: beforeData, error: beforeError } = await supabase.from("members").select("*").eq("id", parsed.id).single();
    if (beforeError) throw beforeError;

    const member = beforeData as Record<string, unknown>;
    const memberName = String(member.name ?? "");
    const targetRole = member.role as Role;
    if (!canDeleteMemberRole({ actorRole: currentMember.role, targetRole })) {
      throw new Error("자신보다 낮은 권한의 멤버만 삭제할 수 있습니다.");
    }
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

    const deletedAuthUserId = typeof member.auth_user_id === "string" ? member.auth_user_id : null;
    if (deletedAuthUserId) {
      const deletedAuthBlockPayload = {
        auth_user_id: deletedAuthUserId,
        deleted_member_id: parsed.id,
        deleted_member_name: memberName,
        deleted_member_email: typeof member.email === "string" ? member.email : null,
        deleted_by_member_id: currentMember.id,
        reason: "member.permanent_delete",
      };
      const { error: deletedAuthUserError } = await supabase.from("deleted_auth_users").insert(deletedAuthBlockPayload);

      if (deletedAuthUserError && deletedAuthUserError.code !== "42P01" && deletedAuthUserError.code !== "23505") {
        throw deletedAuthUserError;
      }
    }

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

export async function restoreDeletedAuthUser(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = restoreDeletedAuthUserSchema.parse({
      authUserId: formData.get("authUserId"),
    });

    const { data: deletedUser, error: deletedUserError } = await supabase
      .from("deleted_auth_users")
      .select("auth_user_id, deleted_member_id, deleted_member_name, deleted_member_email")
      .eq("auth_user_id", parsed.authUserId)
      .maybeSingle();

    if (deletedUserError) throw deletedUserError;
    if (!deletedUser) throw new Error("복구할 삭제 계정 기록을 찾을 수 없습니다.");

    const deletedMemberId = typeof deletedUser.deleted_member_id === "string" ? deletedUser.deleted_member_id : null;
    const { data: auditLog, error: auditLogError } = deletedMemberId
      ? await supabase
          .from("audit_logs")
          .select("before_data")
          .eq("action", "member.permanent_delete")
          .eq("target_id", deletedMemberId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

    if (auditLogError) throw auditLogError;

    const beforeData = (auditLog?.before_data ?? null) as Record<string, unknown> | null;
    const restoredRole = (beforeData?.role === "owner" ||
    beforeData?.role === "admin" ||
    beforeData?.role === "leader" ||
    beforeData?.role === "staff" ||
    beforeData?.role === "member"
      ? beforeData.role
      : "member") as Role;

    if (restoredRole === "owner" && currentMember.role !== "owner") {
      throw new Error("최고 관리자 계정은 최고 관리자만 복구할 수 있습니다.");
    }

    const restoredMemberId = typeof beforeData?.id === "string" ? beforeData.id : deletedMemberId;
    const restoredEmail =
      typeof beforeData?.email === "string" && beforeData.email.trim()
        ? beforeData.email.trim().toLowerCase()
        : typeof deletedUser.deleted_member_email === "string" && deletedUser.deleted_member_email.trim()
          ? deletedUser.deleted_member_email.trim().toLowerCase()
          : null;
    const restoredName =
      typeof beforeData?.name === "string" && beforeData.name.trim()
        ? beforeData.name.trim()
        : typeof deletedUser.deleted_member_name === "string" && deletedUser.deleted_member_name.trim()
          ? deletedUser.deleted_member_name.trim()
          : "복구된 멤버";

    const { data: existingMember, error: existingMemberError } = await supabase
      .from("members")
      .select("id")
      .or(`auth_user_id.eq.${parsed.authUserId}${restoredEmail ? `,email.eq.${restoredEmail}` : ""}`)
      .limit(1)
      .maybeSingle();

    if (existingMemberError) throw existingMemberError;
    if (existingMember) {
      throw new Error("이미 같은 Google 계정이나 이메일을 가진 멤버가 있습니다. 먼저 중복 멤버를 정리해주세요.");
    }

    const restoredMemberPayload = {
      ...(restoredMemberId ? { id: restoredMemberId } : {}),
      auth_user_id: parsed.authUserId,
      group_id: typeof beforeData?.group_id === "string" ? beforeData.group_id : null,
      name: restoredName,
      email: restoredEmail,
      phone: typeof beforeData?.phone === "string" ? beforeData.phone : null,
      address: typeof beforeData?.address === "string" ? beforeData.address : null,
      baptism_status: typeof beforeData?.baptism_status === "string" ? beforeData.baptism_status : null,
      role: restoredRole,
      status: "active",
      custom_fields: beforeData?.custom_fields && typeof beforeData.custom_fields === "object" ? beforeData.custom_fields : {},
      care_notes: typeof beforeData?.care_notes === "string" ? beforeData.care_notes : null,
      updated_at: new Date().toISOString(),
    };

    const { data: restoredMember, error: restoreError } = await supabase
      .from("members")
      .insert(restoredMemberPayload)
      .select("*")
      .single();

    if (restoreError) throw restoreError;

    const { error: unblockError } = await supabase.from("deleted_auth_users").delete().eq("auth_user_id", parsed.authUserId);
    if (unblockError) throw unblockError;

    await writeAuditLog({
      supabase,
      action: "member.restore_deleted_auth_user",
      targetTable: "members",
      targetId: restoredMember.id as string,
      afterData: restoredMember as Record<string, unknown>,
      metadata: {
        restoredAuthUserId: parsed.authUserId,
        restoredFromDeletedMemberId: deletedMemberId,
        restoredByMemberId: currentMember.id,
      },
    });

    revalidateAppData();
    return `${restoredName} 계정을 복구했습니다. 이제 해당 Google 계정으로 다시 로그인할 수 있습니다.`;
  });
}

export async function requestDeletedAuthUserRestore(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("로그인이 필요합니다.");

    const parsed = requestDeletedAuthUserRestoreSchema.parse({
      note: formData.get("note"),
    });

    const { count, error } = await supabase
      .from("deleted_auth_users")
      .update(
        {
          restore_requested_at: new Date().toISOString(),
          restore_request_note: parsed.note,
        },
        { count: "exact" },
      )
      .eq("auth_user_id", user.id);

    if (error) throw error;
    if (count !== 1) throw new Error("복구 요청을 만들 수 없습니다. Newavely 운영 관리자에게 직접 연락해주세요.");

    revalidatePath("/");
    return "복구 요청을 보냈습니다. Newavely 운영 관리자가 확인 후 계정을 다시 활성화해드립니다.";
  });
}

function inferImportantLinkIconKey(url: string) {
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
  if (hostname.includes("instagram.com")) return "instagram";
  if (hostname.includes("linktr.ee")) return "links";
  if (hostname.includes("ccsnewave.org")) return "website";
  return "default";
}

export async function createImportantLink(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("links:write");
    const parsed = importantLinkSchema.parse({
      title: formData.get("title"),
      description: formData.get("description"),
      url: formData.get("url"),
    });

    const { data: inserted, error } = await supabase
      .from("important_links")
      .insert({
        title: parsed.title,
        description: parsed.description,
        url: parsed.url,
        icon_key: inferImportantLinkIconKey(parsed.url),
        created_by_member_id: currentMember.id,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "important_link.create",
      targetTable: "important_links",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
    revalidateAppData();
    return "링크를 추가했습니다.";
  });
}

export async function deleteImportantLink(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("links:write");
    if (!["owner", "admin"].includes(currentMember.role)) {
      throw new Error("관리자 이상만 링크를 삭제할 수 있습니다.");
    }
    const parsed = deleteImportantLinkSchema.parse({
      id: formData.get("id"),
    });

    const { data: beforeData, error: beforeError } = await supabase.from("important_links").select("*").eq("id", parsed.id).single();
    if (beforeError) throw beforeError;

    const { error } = await supabase.from("important_links").delete().eq("id", parsed.id);
    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "important_link.delete",
      targetTable: "important_links",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
    });
    revalidateAppData();
    return "링크를 삭제했습니다.";
  });
}

export async function updateMyStatusMessage(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
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
    const parsed = memberStatusMessageSchema.parse({
      message: formData.get("message"),
    });

    if (!parsed.message) {
      const { error } = await supabase.from("member_status_messages").delete().eq("member_id", currentMember.id);
      if (error) throw error;
      revalidateAppData();
      return "한마디를 비웠습니다.";
    }

    const { error } = await supabase.from("member_status_messages").upsert(
      {
        member_id: currentMember.id,
        message: parsed.message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id" },
    );

    if (error) throw error;
    revalidateAppData();
    return "오늘의 한마디를 저장했습니다.";
  });
}

export async function createAdminFeedbackMessage(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
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
    const parsed = adminFeedbackSchema.parse({
      category: formData.get("category"),
      title: formData.get("title"),
      message: formData.get("message"),
    });

    const { data: inserted, error } = await supabase
      .from("admin_feedback_messages")
      .insert({
        reporter_member_id: currentMember.id,
        category: parsed.category,
        title: parsed.title,
        message: parsed.message,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "admin_feedback.create",
      targetTable: "admin_feedback_messages",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
    revalidateAppData();
    return "관리자에게 메시지를 보냈습니다.";
  });
}

export async function updateAdminFeedbackMessage(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase, currentMember } = await getAuthorizedCurrentMember("roles:manage");
    const parsed = updateAdminFeedbackSchema.parse({
      id: formData.get("id"),
      status: formData.get("status"),
      adminNote: formData.get("adminNote"),
    });
    const resolvedAt = parsed.status === "resolved" || parsed.status === "closed" ? new Date().toISOString() : null;

    const { data: beforeData, error: beforeError } = await supabase
      .from("admin_feedback_messages")
      .select("*")
      .eq("id", parsed.id)
      .single();
    if (beforeError) throw beforeError;

    const { data: updated, error } = await supabase
      .from("admin_feedback_messages")
      .update({
        status: parsed.status,
        admin_note: parsed.adminNote,
        updated_at: new Date().toISOString(),
        resolved_at: resolvedAt,
        resolved_by_member_id: resolvedAt ? currentMember.id : null,
      })
      .eq("id", parsed.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "admin_feedback.update",
      targetTable: "admin_feedback_messages",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: updated as Record<string, unknown>,
    });
    revalidateAppData();
    return "피드백 상태를 업데이트했습니다.";
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
    if (parsed.leaderMemberId) {
      await assignLeaderToGroup({
        supabase,
        leaderMemberId: parsed.leaderMemberId,
        groupId: inserted.id as string,
      });
    }
    await writeAuditLog({
      supabase,
      action: "group.create",
      targetTable: "groups",
      targetId: inserted.id as string,
      afterData: inserted as Record<string, unknown>,
    });
    revalidateAppData();
    return "순을 추가했습니다.";
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
    if (parsed.leaderMemberId) {
      await assignLeaderToGroup({
        supabase,
        leaderMemberId: parsed.leaderMemberId,
        groupId: parsed.id,
      });
    }
    await writeAuditLog({
      supabase,
      action: "group.update",
      targetTable: "groups",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "순을 저장했습니다.";
  });
}

export async function renameGroup(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("groups:write");
    const parsed = renameGroupSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("groups")
      .select("*")
      .eq("id", parsed.id)
      .single();

    if (beforeError) throw beforeError;

    const beforeName = String(beforeData.name ?? "").trim();
    if (beforeName === parsed.name) {
      return "이미 같은 순 이름입니다.";
    }

    const { data: afterData, error } = await supabase
      .from("groups")
      .update({
        name: parsed.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "group.rename",
      targetTable: "groups",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
      afterData: afterData as Record<string, unknown>,
    });
    revalidateAppData();
    return "순 이름을 변경했습니다.";
  });
}

async function assignLeaderToGroup({
  supabase,
  leaderMemberId,
  groupId,
}: {
  supabase: Awaited<ReturnType<typeof getAuthorizedCurrentMember>>["supabase"];
  leaderMemberId: string;
  groupId: string;
}) {
  const { data: beforeLeader, error: beforeLeaderError } = await supabase
    .from("members")
    .select("*")
    .eq("id", leaderMemberId)
    .single();

  if (beforeLeaderError) throw beforeLeaderError;
  if (beforeLeader.group_id === groupId) return;

  const { data: afterLeader, error: leaderUpdateError } = await supabase
    .from("members")
    .update({
      group_id: groupId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leaderMemberId)
    .select("*")
    .single();

  if (leaderUpdateError) throw leaderUpdateError;
  await writeAuditLog({
    supabase,
    action: "member.update",
    targetTable: "members",
    targetId: leaderMemberId,
    beforeData: beforeLeader as Record<string, unknown>,
    afterData: afterLeader as Record<string, unknown>,
  });
}

export async function deleteGroup(_previousState: ActionState, formData: FormData) {
  return runAction(async () => {
    const { supabase } = await getAuthorizedCurrentMember("members:write");
    const parsed = deleteGroupSchema.parse({
      id: formData.get("id"),
    });

    const { data: beforeData, error: beforeError } = await supabase
      .from("groups")
      .select("*")
      .eq("id", parsed.id)
      .single();

    if (beforeError) throw beforeError;

    const { error } = await supabase.from("groups").delete().eq("id", parsed.id);

    if (error) throw error;
    await writeAuditLog({
      supabase,
      action: "group.delete",
      targetTable: "groups",
      targetId: parsed.id,
      beforeData: beforeData as Record<string, unknown>,
    });
    revalidateAppData();
    return "순을 삭제했습니다. 배정된 멤버는 미배정으로 이동됩니다.";
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
