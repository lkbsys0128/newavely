import { hasPermission, type Role } from "@/lib/rbac";
import type { AttendanceEvent, AuditLog, CustomFieldDefinition, Group, Member } from "@/lib/types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  ensureAttendanceEvent,
  formatSupabaseError,
  getAuditLogs,
  getCustomFieldDefinitions,
  getDashboardData,
  getOrCreateCurrentMember,
} from "@/lib/supabase/data";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type ReadyAppPageData = {
  status: "ready";
  user: AppUser;
  attendanceDate: string;
  attendanceTitle: string;
  attendanceEventId?: string;
  attendanceEvents: AttendanceEvent[];
  members: Member[];
  groups: Group[];
  auditLogs?: AuditLog[];
  customFieldDefinitions: CustomFieldDefinition[];
};

export type AppPageData =
  | { status: "setup" }
  | { status: "auth" }
  | { status: "error"; message: string }
  | ReadyAppPageData;

export async function getAppPageData(options?: { attendanceEventId?: string }): Promise<AppPageData> {
  if (!hasSupabaseEnv()) {
    return { status: "setup" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "auth" };
  }

  try {
    const currentMember = await getOrCreateCurrentMember(supabase, {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name,
    });
    await ensureAttendanceEvent(supabase);
    const dashboardData = await getDashboardData(supabase, options?.attendanceEventId);
    const allCustomFieldDefinitions =
      currentMember.role === "admin" || currentMember.role === "leader" ? await getCustomFieldDefinitions(supabase) : [];
    const customFieldDefinitions = hasPermission(currentMember.role, "sensitive:read")
      ? allCustomFieldDefinitions
      : allCustomFieldDefinitions.filter((field) => !field.isSensitive);
    const auditLogs = currentMember.role === "admin" ? await getAuditLogs(supabase) : undefined;

    return {
      status: "ready",
      user: {
        id: user.id,
        name: user.user_metadata?.full_name ?? user.email ?? "관리자",
        email: user.email ?? "",
        role: currentMember.role,
      },
      attendanceDate: dashboardData.attendanceDate,
      attendanceTitle: dashboardData.attendanceTitle,
      attendanceEventId: dashboardData.attendanceEventId,
      attendanceEvents: dashboardData.attendanceEvents,
      members: dashboardData.members,
      groups: dashboardData.groups,
      auditLogs,
      customFieldDefinitions,
    };
  } catch (error) {
    return { status: "error", message: formatSupabaseError(error) };
  }
}
