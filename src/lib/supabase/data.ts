import { getRoleForEmail, type Role } from "@/lib/rbac";
import type {
  AdminFeedbackMessage,
  AttendanceEvent,
  AuditLog,
  CareFollowup,
  CustomFieldDefinition,
  DeletedAuthUser,
  Group,
  ImportantLink,
  Member,
  MemberLinkRequest,
  MemberStatusMessage,
  NewFamilyApplicant,
} from "@/lib/types";
import type { createClient } from "@/lib/supabase/server";
import { formatMemberDisplayName } from "@/lib/member-names";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type DbGroup = {
  id: string;
  name: string;
  leader_member_id: string | null;
  leader?: { name: string | null } | Array<{ name: string | null }> | null;
};

type DbPublicDashboardGroup = {
  id: string;
  name: string;
  leader_member_id: string | null;
  leader_name: string | null;
};

type DbPublicDashboardMember = {
  id: string;
  name: string;
  group_id: string | null;
  group_name: string | null;
  status: "active" | "new" | "care" | "inactive";
  custom_fields: Record<string, unknown> | null;
  is_merged_placeholder: boolean;
  attendance_records?: Array<{
    event_id: string;
    status: "present" | "absent" | "excused";
  }> | null;
};

type DbNewFamilyApplicant = {
  id: string;
  source_row_number: number;
  submitted_at: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  group_interest: string | null;
  memo: string | null;
  status: NewFamilyApplicant["status"];
  source_data: Record<string, unknown> | null;
  converted_member_id: string | null;
  converted_at: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

type DbMember = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  baptism_status: string | null;
  role: Role;
  status: "active" | "new" | "care" | "inactive";
  custom_fields: Record<string, unknown> | null;
  care_notes: string | null;
  group_id: string | null;
  groups?: { name: string | null } | Array<{ name: string | null }> | null;
  attendance_records?:
    | Array<{
        event_id: string;
        status: "present" | "absent" | "excused";
        note: string | null;
        excuse_start_date: string | null;
        excuse_end_date: string | null;
        attendance_events?: { event_date: string; title: string } | Array<{ event_date: string; title: string }> | null;
      }>
    | null;
  care_followups?:
    | Array<{
        id: string;
        status: CareFollowup["status"];
        note: string;
        assigned_to_member_id: string | null;
        created_at: string;
        completed_at: string | null;
        assigned_to?: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
};

type DbAttendanceEvent = {
  id: string;
  event_date: string;
  title: string;
};

type DbCustomFieldDefinition = {
  id: string;
  key: string;
  label: string;
  field_type: "text" | "number" | "date" | "boolean";
  is_sensitive: boolean;
};

type DbAuditLog = {
  id: string;
  action: string;
  target_table: string;
  target_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: { name: string | null } | Array<{ name: string | null }> | null;
};

type DbImportantLink = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  icon_key: ImportantLink["iconKey"] | null;
  created_at: string;
  creator?: { name: string | null } | Array<{ name: string | null }> | null;
};

type DbMemberStatusMessage = {
  member_id: string;
  message: string;
  updated_at: string;
  members?: { name: string | null; custom_fields: Record<string, unknown> | null; groups?: { name: string | null } | Array<{ name: string | null }> | null } | Array<{
    name: string | null;
    custom_fields: Record<string, unknown> | null;
    groups?: { name: string | null } | Array<{ name: string | null }> | null;
  }> | null;
};

type DbAdminFeedbackMessage = {
  id: string;
  reporter_member_id: string;
  category: AdminFeedbackMessage["category"];
  title: string;
  message: string;
  status: AdminFeedbackMessage["status"];
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reporter?:
    | {
        name: string | null;
        custom_fields: Record<string, unknown> | null;
        groups?: { name: string | null } | Array<{ name: string | null }> | null;
      }
    | Array<{
        name: string | null;
        custom_fields: Record<string, unknown> | null;
        groups?: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
};

type DbMemberLinkRequest = {
  id: string;
  requester_member_id: string;
  target_member_id: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  requester?:
    | { name: string | null; email: string | null; status: DbMember["status"] | null }
    | Array<{ name: string | null; email: string | null; status: DbMember["status"] | null }>
    | null;
  target?: { name: string | null; email: string | null } | Array<{ name: string | null; email: string | null }> | null;
};

type DbDeletedAuthUser = {
  auth_user_id: string;
  deleted_member_id?: string | null;
  deleted_member_name: string | null;
  deleted_member_email?: string | null;
  created_at?: string;
  restore_requested_at?: string | null;
  restore_request_note?: string | null;
};

async function getDeletedAuthUserBlock(supabase: SupabaseClient, authUserId: string) {
  const { data, error } = await supabase
    .from("deleted_auth_users")
    .select("auth_user_id, deleted_member_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return null;
    throw error;
  }

  return data as DbDeletedAuthUser | null;
}

export async function getOrCreateCurrentMember(
  supabase: SupabaseClient,
  user: { id: string; email?: string; name?: string },
) {
  const deletedAuthUser = await getDeletedAuthUserBlock(supabase, user.id);
  if (deletedAuthUser) {
    throw new Error(
      `이 Google 계정은 이전에 삭제된 멤버 계정과 연결되어 있어 지금은 로그인할 수 없습니다. 다시 활성화가 필요하면 Newavely 운영 관리자에게 연락해주세요.`,
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("members")
    .select("id, role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    if (existing.status === "inactive") {
      throw new Error("이 계정은 현재 비활성화되어 로그인할 수 없습니다. 다시 활성화가 필요하면 Newavely 운영 관리자에게 연락해주세요.");
    }

    return {
      id: existing.id as string,
      role: existing.role as Role,
      status: existing.status as DbMember["status"],
      needsOnboarding: existing.status === "new",
    };
  }

  const role = getRoleForEmail(user.email ?? "");
  const normalizedEmail = user.email?.trim().toLowerCase();
  const customFields = {
    google_account_name: user.name ?? user.email ?? "새 로그인 사용자",
    google_account_email: normalizedEmail ?? "",
    onboarding_status: "profile_link_required",
  };

  const { data: inserted, error: insertError } = await supabase
    .from("members")
    .insert({
      auth_user_id: user.id,
      name: user.name ?? user.email ?? "새 멤버",
      email: normalizedEmail && !normalizedEmail.endsWith("@merged.local") ? normalizedEmail : null,
      role,
      status: "new",
      custom_fields: customFields,
    })
    .select("id, role, status")
    .single();

  if (insertError?.code === "23505" && normalizedEmail) {
    const { data: insertedWithoutEmail, error: fallbackInsertError } = await supabase
      .from("members")
      .insert({
        auth_user_id: user.id,
        name: user.name ?? user.email ?? "새 멤버",
        email: null,
        role,
        status: "new",
        custom_fields: customFields,
      })
      .select("id, role, status")
      .single();

    if (fallbackInsertError) throw fallbackInsertError;
    return {
      id: insertedWithoutEmail.id as string,
      role: insertedWithoutEmail.role as Role,
      status: insertedWithoutEmail.status as DbMember["status"],
      needsOnboarding: true,
    };
  }

  if (insertError) throw insertError;
  return {
    id: inserted.id as string,
    role: inserted.role as Role,
    status: inserted.status as DbMember["status"],
    needsOnboarding: true,
  };
}

const DEFAULT_ATTENDANCE_TITLES = ["주일 예배", "순모임"] as const;

function getLosAngelesDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Los_Angeles",
    weekday: "short",
    year: "numeric",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: parts.day,
    month: parts.month,
    weekday: parts.weekday,
    year: parts.year,
  };
}

export function getLosAngelesMostRecentSunday(date = new Date()) {
  const parts = getLosAngelesDateParts(date);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const losAngelesDateAtNoonUtc = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12),
  );
  losAngelesDateAtNoonUtc.setUTCDate(losAngelesDateAtNoonUtc.getUTCDate() - Math.max(weekdayIndex, 0));
  return losAngelesDateAtNoonUtc.toISOString().slice(0, 10);
}

export async function ensureAttendanceEvent(
  supabase: SupabaseClient,
  options: { autoCreateSundayWorship?: boolean; createdByMemberId?: string; targetDate?: string } = {},
) {
  const { count: eventCount, error: eventCountError } = await supabase
    .from("attendance_events")
    .select("id", { count: "exact", head: true });

  if (eventCountError) throw eventCountError;

  const eventsToEnsure: Array<{ event_date: string; title: string; created_by_member_id?: string }> = [];
  if (options.autoCreateSundayWorship) {
    const eventDate = options.targetDate || getLosAngelesMostRecentSunday();
    for (const title of DEFAULT_ATTENDANCE_TITLES) {
      const event = {
        event_date: eventDate,
        title,
        ...(options.createdByMemberId ? { created_by_member_id: options.createdByMemberId } : {}),
      };
      eventsToEnsure.push(event);
    }
  } else if (!eventCount) {
    for (const title of DEFAULT_ATTENDANCE_TITLES) {
      eventsToEnsure.push({
        event_date: "2026-05-24",
        title,
        ...(options.createdByMemberId ? { created_by_member_id: options.createdByMemberId } : {}),
      });
    }
  }

  for (const event of eventsToEnsure) {
    const { data: existingEvent, error: existingEventError } = await supabase
      .from("attendance_events")
      .select("id")
      .eq("event_date", event.event_date)
      .eq("title", event.title)
      .limit(1)
      .maybeSingle();

    if (existingEventError) throw existingEventError;
    if (existingEvent) continue;

    const { error } = await supabase.from("attendance_events").insert(event);
    if (error) throw error;
  }
}

export function formatSupabaseError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter(Boolean)
      .map(String)
      .join(" · ");
  }

  return String(error);
}

export async function getDashboardData(supabase: SupabaseClient, selectedEventId?: string) {
  const [
    { data: eventsData, error: eventsError },
    { data: groupsData, error: groupsError },
    { data: membersData, error: membersError },
  ] = await Promise.all([
    supabase
      .from("attendance_events")
      .select("id, event_date, title")
      .order("event_date", { ascending: false })
      .order("title", { ascending: true }),
    supabase
      .from("groups")
      .select("id, name, leader_member_id, leader:members!groups_leader_member_id_fkey(name)")
      .order("name"),
    supabase
      .from("members")
      .select(
        "id, auth_user_id, name, email, phone, address, baptism_status, role, status, custom_fields, care_notes, group_id, groups!members_group_id_fkey(name), attendance_records!attendance_records_member_id_fkey(event_id, status, note, excuse_start_date, excuse_end_date, attendance_events(event_date, title)), care_followups!care_followups_member_id_fkey(id, status, note, assigned_to_member_id, created_at, completed_at, assigned_to:members!care_followups_assigned_to_member_id_fkey(name))",
      )
      .order("name"),
  ]);

  if (eventsError) throw eventsError;
  if (groupsError) throw groupsError;
  if (membersError) throw membersError;

  const attendanceEvents = (eventsData as unknown as DbAttendanceEvent[]).map<AttendanceEvent>((event) => ({
    id: event.id,
    eventDate: event.event_date,
    title: event.title,
  }));

  const selectedEvent = attendanceEvents.find((event) => event.id === selectedEventId) ?? attendanceEvents[0];

  const groups = (groupsData as unknown as DbGroup[]).map<Group>((group) => {
    const leader = Array.isArray(group.leader) ? group.leader[0] : group.leader;
    return {
      id: group.id,
      name: group.name,
      leaderMemberId: group.leader_member_id,
      leaderName: leader?.name ?? "미배정",
    };
  });

  const members = (membersData as unknown as DbMember[]).map<Member>((member) => {
    const group = Array.isArray(member.groups) ? member.groups[0] : member.groups;
    const attendanceHistory = (member.attendance_records ?? [])
      .map((record) => {
        const event = Array.isArray(record.attendance_events) ? record.attendance_events[0] : record.attendance_events;
        return {
          eventId: record.event_id,
          eventDate: event?.event_date ?? "",
          title: event?.title ?? "출석 이벤트",
          status: record.status,
          note: record.note ?? "",
          excuseStartDate: record.excuse_start_date ?? "",
          excuseEndDate: record.excuse_end_date ?? "",
        };
      })
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
    const careFollowups = (member.care_followups ?? [])
      .map<CareFollowup>((followup) => {
        const assignedTo = Array.isArray(followup.assigned_to) ? followup.assigned_to[0] : followup.assigned_to;
        return {
          id: followup.id,
          status: followup.status,
          note: followup.note,
          assignedToMemberId: followup.assigned_to_member_id,
          assignedToName: assignedTo?.name ?? "미배정",
          createdAt: followup.created_at,
          completedAt: followup.completed_at,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const customFields = member.custom_fields ?? {};
    const mappedMember = {
      id: member.id,
      authUserId: member.auth_user_id,
      name: member.name,
      displayName: member.name,
      phone: member.phone ?? "미입력",
      groupId: member.group_id,
      groupName: group?.name ?? "미배정",
      role: member.role,
      status: member.status,
      email: member.email ?? "",
      address: member.address ?? "미입력",
      baptismStatus: member.baptism_status ?? "미입력",
      notes: member.care_notes ?? "메모 없음",
      customFields,
      present: Boolean(member.attendance_records?.some((record) => record.event_id === selectedEvent?.id && record.status === "present")),
      attendanceHistory,
      careFollowups,
    };
    return {
      ...mappedMember,
      displayName: formatMemberDisplayName(mappedMember),
    };
  });

  return {
    attendanceEventId: selectedEvent?.id,
    attendanceDate: selectedEvent?.eventDate ?? "2026-05-24",
    attendanceTitle: selectedEvent?.title ?? "주일 예배",
    attendanceEvents,
    groups,
    members,
  };
}

export async function getPublicDashboardData(supabase: SupabaseClient, selectedEventId?: string) {
  const [
    { data: eventsData, error: eventsError },
    { data: groupsData, error: groupsError },
    { data: membersData, error: membersError },
  ] = await Promise.all([
    supabase
      .from("attendance_events")
      .select("id, event_date, title")
      .order("event_date", { ascending: false })
      .order("title", { ascending: true }),
    supabase.rpc("get_public_dashboard_groups"),
    supabase.rpc("get_public_dashboard_members"),
  ]);

  if (eventsError) throw eventsError;
  if (groupsError) throw groupsError;
  if (membersError) throw membersError;

  const attendanceEvents = (eventsData as unknown as DbAttendanceEvent[]).map<AttendanceEvent>((event) => ({
    id: event.id,
    eventDate: event.event_date,
    title: event.title,
  }));
  const selectedEvent = attendanceEvents.find((event) => event.id === selectedEventId) ?? attendanceEvents[0];

  const groups = ((groupsData ?? []) as unknown as DbPublicDashboardGroup[]).map<Group>((group) => ({
    id: group.id,
    name: group.name,
    leaderMemberId: group.leader_member_id,
    leaderName: group.leader_name ?? "미배정",
  }));

  const members = ((membersData ?? []) as unknown as DbPublicDashboardMember[]).map<Member>((member) => {
    const attendanceHistory = (member.attendance_records ?? []).map((record) => ({
      eventId: record.event_id,
      eventDate: "",
      title: "",
      status: record.status,
      note: "",
      excuseStartDate: "",
      excuseEndDate: "",
    }));
    const mappedMember = {
      id: member.id,
      authUserId: null,
      name: member.name,
      displayName: member.name,
      phone: "",
      groupId: member.group_id,
      groupName: member.group_name ?? "미배정",
      role: "member" as Role,
      status: member.status,
      email: member.is_merged_placeholder ? `${member.id}@merged.local` : "",
      address: "",
      baptismStatus: "",
      notes: "",
      customFields: member.custom_fields ?? {},
      present: Boolean(member.attendance_records?.some((record) => record.event_id === selectedEvent?.id && record.status === "present")),
      attendanceHistory,
      careFollowups: [],
    };
    return {
      ...mappedMember,
      displayName: formatMemberDisplayName(mappedMember),
    };
  });

  return {
    attendanceEventId: selectedEvent?.id,
    attendanceDate: selectedEvent?.eventDate ?? "2026-05-24",
    attendanceTitle: selectedEvent?.title ?? "주일 예배",
    attendanceEvents,
    groups,
    members,
  };
}

export async function getCustomFieldDefinitions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("member_custom_field_definitions")
    .select("id, key, label, field_type, is_sensitive")
    .order("label");

  if (error) throw error;

  return (data as unknown as DbCustomFieldDefinition[]).map<CustomFieldDefinition>((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    fieldType: field.field_type,
    isSensitive: field.is_sensitive,
  }));
}

export async function getAuditLogs(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, action, target_table, target_id, before_data, after_data, metadata, created_at, actor:members!audit_logs_actor_member_id_fkey(name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return (data as unknown as DbAuditLog[]).map<AuditLog>((log) => {
    const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor;
    return {
      id: log.id,
      action: log.action,
      targetTable: log.target_table,
      targetId: log.target_id,
      actorName: actor?.name ?? "알 수 없음",
      beforeData: log.before_data,
      afterData: log.after_data,
      metadata: log.metadata ?? {},
      createdAt: log.created_at,
    };
  });
}

export async function getImportantLinks(supabase: SupabaseClient): Promise<ImportantLink[]> {
  const { data, error } = await supabase
    .from("important_links")
    .select("id, title, description, url, icon_key, created_at, creator:members!important_links_created_by_member_id_fkey(name)")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return ((data ?? []) as unknown as DbImportantLink[]).map((link) => {
    const creator = Array.isArray(link.creator) ? link.creator[0] : link.creator;
    return {
      id: link.id,
      title: link.title,
      description: link.description ?? "",
      url: link.url,
      iconKey: link.icon_key ?? "default",
      createdByName: creator?.name ?? "알 수 없음",
      createdAt: link.created_at,
    };
  });
}

export async function getMemberStatusMessages(supabase: SupabaseClient): Promise<MemberStatusMessage[]> {
  const { data, error } = await supabase
    .from("member_status_messages")
    .select("member_id, message, updated_at, members!member_status_messages_member_id_fkey(name, custom_fields, groups!members_group_id_fkey(name))")
    .order("updated_at", { ascending: false })
    .limit(24);

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return ((data ?? []) as unknown as DbMemberStatusMessage[]).map((status) => {
    const member = Array.isArray(status.members) ? status.members[0] : status.members;
    const group = Array.isArray(member?.groups) ? member?.groups[0] : member?.groups;
    return {
      memberId: status.member_id,
      memberName: formatMemberDisplayName({
        name: member?.name ?? "알 수 없음",
        customFields: member?.custom_fields ?? {},
      }),
      groupName: group?.name ?? "미배정",
      message: status.message,
      updatedAt: status.updated_at,
    };
  });
}

export async function getAdminFeedbackMessages(
  supabase: SupabaseClient,
  currentMemberId: string,
  includeAll: boolean,
): Promise<AdminFeedbackMessage[]> {
  let query = supabase
    .from("admin_feedback_messages")
    .select(
      "id, reporter_member_id, category, title, message, status, admin_note, created_at, updated_at, resolved_at, reporter:members!admin_feedback_messages_reporter_member_id_fkey(name, custom_fields, groups!members_group_id_fkey(name))",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (!includeAll) {
    query = query.eq("reporter_member_id", currentMemberId);
  }

  const { data, error } = await query;

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return ((data ?? []) as unknown as DbAdminFeedbackMessage[]).map((item) => {
    const reporter = Array.isArray(item.reporter) ? item.reporter[0] : item.reporter;
    const group = Array.isArray(reporter?.groups) ? reporter?.groups[0] : reporter?.groups;

    return {
      id: item.id,
      reporterMemberId: item.reporter_member_id,
      reporterName: formatMemberDisplayName({
        name: reporter?.name ?? "알 수 없음",
        customFields: reporter?.custom_fields ?? {},
      }),
      reporterGroupName: group?.name ?? "미배정",
      category: item.category,
      title: item.title,
      message: item.message,
      status: item.status,
      adminNote: item.admin_note ?? "",
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      resolvedAt: item.resolved_at,
    };
  });
}

export async function getNewFamilyApplicants(supabase: SupabaseClient): Promise<NewFamilyApplicant[]> {
  const { data, error } = await supabase
    .from("new_family_applicants")
    .select(
      "id, source_row_number, submitted_at, name, email, phone, group_interest, memo, status, source_data, converted_member_id, converted_at, last_synced_at, created_at, updated_at",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("source_row_number", { ascending: false })
    .limit(300);

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return ((data ?? []) as DbNewFamilyApplicant[]).map((applicant) => ({
    id: applicant.id,
    sourceRowNumber: applicant.source_row_number,
    submittedAt: applicant.submitted_at,
    name: applicant.name,
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    groupInterest: applicant.group_interest ?? "",
    memo: applicant.memo ?? "",
    status: applicant.status,
    sourceData: applicant.source_data ?? {},
    convertedMemberId: applicant.converted_member_id,
    convertedAt: applicant.converted_at,
    lastSyncedAt: applicant.last_synced_at,
    createdAt: applicant.created_at,
    updatedAt: applicant.updated_at,
  }));
}

export async function getDeletedAuthUsers(supabase: SupabaseClient): Promise<DeletedAuthUser[]> {
  const { data, error } = await supabase
    .from("deleted_auth_users")
    .select("auth_user_id, deleted_member_id, deleted_member_name, deleted_member_email, created_at, restore_requested_at, restore_request_note")
    .not("restore_requested_at", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  const deletedUsers = data as unknown as DbDeletedAuthUser[];
  const deletedMemberIds = deletedUsers.map((user) => user.deleted_member_id).filter((id): id is string => Boolean(id));
  const auditBeforeDataByTargetId = new Map<string, Record<string, unknown>>();

  if (deletedMemberIds.length > 0) {
    const { data: auditData, error: auditError } = await supabase
      .from("audit_logs")
      .select("target_id, before_data")
      .eq("action", "member.permanent_delete")
      .in("target_id", deletedMemberIds);

    if (auditError && auditError.code !== "42P01") throw auditError;

    for (const log of (auditData ?? []) as Array<{ target_id: string | null; before_data: Record<string, unknown> | null }>) {
      if (log.target_id && log.before_data) auditBeforeDataByTargetId.set(log.target_id, log.before_data);
    }
  }

  return deletedUsers.map((user) => ({
    authUserId: user.auth_user_id,
    deletedMemberId: user.deleted_member_id ?? null,
    deletedMemberName: user.deleted_member_name ?? "삭제된 멤버",
    deletedMemberEmail: user.deleted_member_email ?? "",
    deletedAt: user.created_at ?? "",
    restoreRequestedAt: user.restore_requested_at ?? null,
    restoreRequestNote: user.restore_request_note ?? "",
    restoreData: user.deleted_member_id ? auditBeforeDataByTargetId.get(user.deleted_member_id) ?? null : null,
  }));
}

export async function getMemberLinkRequests(supabase: SupabaseClient, currentMemberId: string, includeAll: boolean) {
  let query = supabase
    .from("member_link_requests")
    .select(
      "id, requester_member_id, target_member_id, status, note, created_at, resolved_at, requester:members!member_link_requests_requester_member_id_fkey(name, email, status), target:members!member_link_requests_target_member_id_fkey(name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (!includeAll) {
    query = query.eq("requester_member_id", currentMemberId);
  }

  const { data, error } = await query;

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data as unknown as DbMemberLinkRequest[]).map<MemberLinkRequest>((request) => {
    const requester = Array.isArray(request.requester) ? request.requester[0] : request.requester;
    const target = Array.isArray(request.target) ? request.target[0] : request.target;
    return {
      id: request.id,
      requesterMemberId: request.requester_member_id,
      requesterName: requester?.name ?? "알 수 없음",
      requesterEmail: requester?.email ?? "",
      requesterStatus: requester?.status ?? null,
      targetMemberId: request.target_member_id,
      targetName: target?.name ?? "관리자 확인 필요",
      targetEmail: target?.email ?? "",
      status: request.status,
      note: request.note ?? "",
      createdAt: request.created_at,
      resolvedAt: request.resolved_at,
    };
  });
}
