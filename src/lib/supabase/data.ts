import { getRoleForEmail, type Role } from "@/lib/rbac";
import type { AttendanceEvent, AuditLog, CareFollowup, CustomFieldDefinition, Group, Member, MemberLinkRequest } from "@/lib/types";
import type { createClient } from "@/lib/supabase/server";
import { formatMemberDisplayName } from "@/lib/member-names";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type DbGroup = {
  id: string;
  name: string;
  leader_member_id: string | null;
  leader?: { name: string | null } | Array<{ name: string | null }> | null;
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

export async function getOrCreateCurrentMember(
  supabase: SupabaseClient,
  user: { id: string; email?: string; name?: string },
) {
  const { data: existing, error: existingError } = await supabase
    .from("members")
    .select("id, role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
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

function getLosAngelesToday() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Los_Angeles",
    weekday: "short",
    year: "numeric",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    isSunday: parts.weekday === "Sun",
  };
}

export async function ensureAttendanceEvent(
  supabase: SupabaseClient,
  options: { autoCreateSundayWorship?: boolean; createdByMemberId?: string } = {},
) {
  const { count: eventCount, error: eventCountError } = await supabase
    .from("attendance_events")
    .select("id", { count: "exact", head: true });

  if (eventCountError) throw eventCountError;

  const eventsToEnsure: Array<{ event_date: string; title: string; created_by_member_id?: string }> = [];
  const today = getLosAngelesToday();

  if (options.autoCreateSundayWorship && today.isSunday) {
    eventsToEnsure.push({
      event_date: today.date,
      title: "주일 예배",
      created_by_member_id: options.createdByMemberId,
    });
  } else if (!eventCount) {
    eventsToEnsure.push({
      event_date: "2026-05-24",
      title: "주일 예배",
      created_by_member_id: options.createdByMemberId,
    });
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
  const { data: eventsData, error: eventsError } = await supabase
    .from("attendance_events")
    .select("id, event_date, title")
    .order("event_date", { ascending: false })
    .order("title", { ascending: true });

  if (eventsError) throw eventsError;

  const attendanceEvents = (eventsData as unknown as DbAttendanceEvent[]).map<AttendanceEvent>((event) => ({
    id: event.id,
    eventDate: event.event_date,
    title: event.title,
  }));

  const selectedEvent = attendanceEvents.find((event) => event.id === selectedEventId) ?? attendanceEvents[0];

  const { data: groupsData, error: groupsError } = await supabase
    .from("groups")
    .select("id, name, leader_member_id, leader:members!groups_leader_member_id_fkey(name)")
    .order("name");

  if (groupsError) throw groupsError;

  const { data: membersData, error: membersError } = await supabase
    .from("members")
    .select(
      "id, auth_user_id, name, email, phone, address, baptism_status, role, status, custom_fields, care_notes, group_id, groups!members_group_id_fkey(name), attendance_records!attendance_records_member_id_fkey(event_id, status, note, excuse_start_date, excuse_end_date, attendance_events(event_date, title)), care_followups!care_followups_member_id_fkey(id, status, note, assigned_to_member_id, created_at, completed_at, assigned_to:members!care_followups_assigned_to_member_id_fkey(name))",
    )
    .order("name");

  if (membersError) throw membersError;

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
