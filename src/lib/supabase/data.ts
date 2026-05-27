import { getRoleForEmail, type Role } from "@/lib/rbac";
import type { AttendanceEvent, AuditLog, CareFollowup, CustomFieldDefinition, Group, Member } from "@/lib/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type DbGroup = {
  id: string;
  name: string;
  leader_member_id: string | null;
  target_size: number;
  leader?: { name: string | null } | Array<{ name: string | null }> | null;
};

type DbMember = {
  id: string;
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

export async function getOrCreateCurrentMember(
  supabase: SupabaseClient,
  user: { id: string; email?: string; name?: string },
) {
  const { data: existing, error: existingError } = await supabase
    .from("members")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return { id: existing.id as string, role: existing.role as Role };

  const role = getRoleForEmail(user.email ?? "");
  const { data: inserted, error: insertError } = await supabase
    .from("members")
    .insert({
      auth_user_id: user.id,
      name: user.name ?? user.email ?? "새 멤버",
      email: user.email ?? null,
      role,
      status: "active",
    })
    .select("id, role")
    .single();

  if (insertError) throw insertError;
  return { id: inserted.id as string, role: inserted.role as Role };
}

export async function ensureAttendanceEvent(supabase: SupabaseClient) {
  const { count: eventCount, error: eventCountError } = await supabase
    .from("attendance_events")
    .select("id", { count: "exact", head: true });

  if (eventCountError) throw eventCountError;

  if (!eventCount) {
    const { error } = await supabase.from("attendance_events").insert({
      event_date: "2026-05-24",
      title: "주일 예배",
    });
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
    .limit(12);

  if (eventsError) throw eventsError;

  const attendanceEvents = (eventsData as unknown as DbAttendanceEvent[]).map<AttendanceEvent>((event) => ({
    id: event.id,
    eventDate: event.event_date,
    title: event.title,
  }));

  const selectedEvent = attendanceEvents.find((event) => event.id === selectedEventId) ?? attendanceEvents[0];

  const { data: groupsData, error: groupsError } = await supabase
    .from("groups")
    .select("id, name, leader_member_id, target_size, leader:members!groups_leader_member_id_fkey(name)")
    .order("name");

  if (groupsError) throw groupsError;

  const { data: membersData, error: membersError } = await supabase
    .from("members")
    .select(
      "id, name, email, phone, address, baptism_status, role, status, custom_fields, care_notes, group_id, groups!members_group_id_fkey(name), attendance_records!attendance_records_member_id_fkey(event_id, status, note, excuse_start_date, excuse_end_date, attendance_events(event_date, title)), care_followups!care_followups_member_id_fkey(id, status, note, assigned_to_member_id, created_at, completed_at, assigned_to:members!care_followups_assigned_to_member_id_fkey(name))",
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
      targetSize: group.target_size,
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
    return {
      id: member.id,
      name: member.name,
      phone: member.phone ?? "미입력",
      groupId: member.group_id,
      groupName: group?.name ?? "미배정",
      role: member.role,
      status: member.status,
      email: member.email ?? "",
      address: member.address ?? "미입력",
      baptismStatus: member.baptism_status ?? "미입력",
      notes: member.care_notes ?? "메모 없음",
      customFields: member.custom_fields ?? {},
      present: Boolean(member.attendance_records?.some((record) => record.event_id === selectedEvent?.id && record.status === "present")),
      attendanceHistory,
      careFollowups,
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
