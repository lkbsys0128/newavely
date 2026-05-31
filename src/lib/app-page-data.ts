import { hasPermission, type Role } from "@/lib/rbac";
import type { AttendanceEvent, AuditLog, CustomFieldDefinition, Group, Member, MemberLinkRequest } from "@/lib/types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { scopeMembersForRole } from "@/lib/member-visibility";
import { isMergedPlaceholderMember } from "@/lib/member-filters";
import { createClient } from "@/lib/supabase/server";
import {
  ensureAttendanceEvent,
  formatSupabaseError,
  getAuditLogs,
  getCustomFieldDefinitions,
  getDashboardData,
  getMemberLinkRequests,
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
  memberLinkRequests: MemberLinkRequest[];
  auditLogs?: AuditLog[];
  customFieldDefinitions: CustomFieldDefinition[];
  dashboardMetrics: DashboardMetrics;
};

export type DashboardMetrics = {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  presentMembers: number;
  attendanceEligibleMembers: number;
  groups: number;
};

export type OnboardingAppPageData = {
  status: "onboarding";
  user: AppUser;
  currentMemberId: string;
  members: Member[];
  memberLinkRequests: MemberLinkRequest[];
};

export type AppPageData =
  | { status: "setup" }
  | { status: "auth" }
  | { status: "error"; message: string }
  | OnboardingAppPageData
  | ReadyAppPageData;

export function buildDashboardMetrics(members: Member[], groups: Group[]): DashboardMetrics {
  const visibleMembers = members.filter((member) => !isMergedPlaceholderMember(member));
  const activeMembers = visibleMembers.filter((member) => member.status !== "inactive");
  const presentMembers = activeMembers.filter((member) => member.present);

  return {
    totalMembers: visibleMembers.length,
    activeMembers: activeMembers.length,
    inactiveMembers: visibleMembers.length - activeMembers.length,
    presentMembers: presentMembers.length,
    attendanceEligibleMembers: activeMembers.length,
    groups: groups.length,
  };
}

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
    const currentRosterMember = dashboardData.members.find((member) => member.id === currentMember.id);
    const appUser = {
      id: user.id,
      name: currentRosterMember?.displayName ?? user.user_metadata?.full_name ?? user.email ?? "새 로그인 사용자",
      email: user.email ?? "",
      role: currentMember.role,
    };

    if (currentMember.needsOnboarding) {
      const memberLinkRequests = await getMemberLinkRequests(supabase, currentMember.id, false);

      return {
        status: "onboarding",
        user: appUser,
        currentMemberId: currentMember.id,
        members: dashboardData.members,
        memberLinkRequests,
      };
    }

    const allCustomFieldDefinitions = hasPermission(currentMember.role, "members:read")
      ? await getCustomFieldDefinitions(supabase)
      : [];
    const customFieldDefinitions = hasPermission(currentMember.role, "sensitive:read")
      ? allCustomFieldDefinitions
      : allCustomFieldDefinitions.filter((field) => !field.isSensitive);
    const auditLogs = hasPermission(currentMember.role, "roles:manage") ? await getAuditLogs(supabase) : undefined;
    const memberLinkRequests = await getMemberLinkRequests(
      supabase,
      currentMember.id,
      hasPermission(currentMember.role, "roles:manage"),
    );
    const scopedMembers = scopeMembersForRole({
      role: currentMember.role,
      currentMemberId: currentMember.id,
      groups: dashboardData.groups,
      members: dashboardData.members,
    });
    const dashboardMetrics = buildDashboardMetrics(dashboardData.members, dashboardData.groups);

    return {
      status: "ready",
      user: appUser,
      attendanceDate: dashboardData.attendanceDate,
      attendanceTitle: dashboardData.attendanceTitle,
      attendanceEventId: dashboardData.attendanceEventId,
      attendanceEvents: dashboardData.attendanceEvents,
      members: scopedMembers,
      groups: dashboardData.groups,
      memberLinkRequests,
      auditLogs,
      customFieldDefinitions,
      dashboardMetrics,
    };
  } catch (error) {
    return { status: "error", message: formatSupabaseError(error) };
  }
}
