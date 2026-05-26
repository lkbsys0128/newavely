import { getRoleForEmail, type Role } from "@/lib/rbac";
import type { Group, Member } from "@/lib/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type DbGroup = {
  id: string;
  name: string;
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
  care_notes: string | null;
  group_id: string | null;
  groups?: { name: string | null } | Array<{ name: string | null }> | null;
  attendance_records?: Array<{ status: "present" | "absent" | "excused" }> | null;
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

export async function getDashboardData(supabase: SupabaseClient) {
  const { data: latestEvent, error: eventError } = await supabase
    .from("attendance_events")
    .select("id, event_date")
    .order("event_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) throw eventError;

  const { data: groupsData, error: groupsError } = await supabase
    .from("groups")
    .select("id, name, target_size, leader:members!groups_leader_member_id_fkey(name)")
    .order("name");

  if (groupsError) throw groupsError;

  const { data: membersData, error: membersError } = await supabase
    .from("members")
    .select(
      "id, name, email, phone, address, baptism_status, role, status, care_notes, group_id, groups(name), attendance_records(status)",
    )
    .neq("status", "inactive")
    .order("name");

  if (membersError) throw membersError;

  const groups = (groupsData as unknown as DbGroup[]).map<Group>((group) => {
    const leader = Array.isArray(group.leader) ? group.leader[0] : group.leader;
    return {
      id: group.id,
      name: group.name,
      leaderName: leader?.name ?? "미배정",
      targetSize: group.target_size,
    };
  });

  const members = (membersData as unknown as DbMember[]).map<Member>((member) => {
    const group = Array.isArray(member.groups) ? member.groups[0] : member.groups;
    return {
      id: member.id,
      name: member.name,
      phone: member.phone ?? "미입력",
      groupId: member.group_id,
      groupName: group?.name ?? "미배정",
      role: member.role,
      status: member.status === "inactive" ? "care" : member.status,
      email: member.email ?? "",
      address: member.address ?? "미입력",
      baptismStatus: member.baptism_status ?? "미입력",
      notes: member.care_notes ?? "메모 없음",
      present: Boolean(member.attendance_records?.some((record) => record.status === "present")),
    };
  });

  return {
    attendanceEventId: latestEvent?.id as string | undefined,
    attendanceDate: (latestEvent?.event_date as string | undefined) ?? "2026-05-24",
    groups,
    members,
  };
}
