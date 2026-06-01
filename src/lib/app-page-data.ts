import { hasPermission, type Role } from "@/lib/rbac";
import type {
  AdminFeedbackMessage,
  AttendanceEvent,
  AuditLog,
  CustomFieldDefinition,
  DeletedAuthUser,
  Group,
  ImportantLink,
  Member,
  MemberLinkRequest,
  MemberStatusMessage,
} from "@/lib/types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { scopeMembersForRole } from "@/lib/member-visibility";
import { isMergedPlaceholderMember } from "@/lib/member-filters";
import { calculateKoreanAge, ministryOptions, normalizeJobValue, normalizeMinistryValue } from "@/lib/member-field-options";
import { createClient } from "@/lib/supabase/server";
import {
  ensureAttendanceEvent,
  formatSupabaseError,
  getAuditLogs,
  getAdminFeedbackMessages,
  getCustomFieldDefinitions,
  getDashboardData,
  getDeletedAuthUsers,
  getImportantLinks,
  getMemberLinkRequests,
  getMemberStatusMessages,
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
  deletedAuthUsers: DeletedAuthUser[];
  importantLinks: ImportantLink[];
  memberStatusMessages: MemberStatusMessage[];
  adminFeedbackMessages: AdminFeedbackMessage[];
  customFieldDefinitions: CustomFieldDefinition[];
  dashboardMetrics: DashboardMetrics;
  globalStats: GlobalAppStats;
};

export type DashboardMetrics = {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  presentMembers: number;
  attendanceEligibleMembers: number;
  groups: number;
};

export type StatSummaryRow = {
  label: string;
  count: number;
  ratio: number;
};

export type StatisticsSummary = {
  totalMembers: number;
  gender: StatSummaryRow[];
  age: StatSummaryRow[];
  job: StatSummaryRow[];
  ministry: StatSummaryRow[];
};

export type GroupPageStats = {
  activeMembers: number;
  assignedMembers: number;
  unassignedMembers: number;
  assignedLeaderCount: number;
  groups: Array<{
    id: string;
    memberCount: number;
    careCount: number;
  }>;
};

export type GroupAttendanceSummary = {
  id: string;
  latestWorshipRate: number | null;
  averageWorshipRate: number | null;
  latestGroupMeetingRate: number | null;
  averageGroupMeetingRate: number | null;
};

export type AttendanceGroupStat = {
  id: string;
  name: string;
  presentCount: number;
  totalCount: number;
  rate: number;
};

export type AttendanceAggregateGroupStat = {
  eventType: string;
  id: string;
  name: string;
  memberCount: number;
  possibleCount: number;
  presentCount: number;
  excusedCount: number;
  rate: number;
};

export type AttendanceEventTrendStat = AttendanceEvent & {
  presentCount: number;
  rate: number;
};

export type AttendanceEventGroupTrendStat = {
  eventId: string;
  eventDate: string;
  eventType: string;
  groupId: string;
  groupName: string;
  totalCount: number;
  presentCount: number;
  excusedCount: number;
  rate: number;
};

export type AttendancePageStats = {
  activeMemberCount: number;
  currentPresentCount: number;
  currentExcusedCount: number;
  currentAbsentCount: number;
  currentAttendanceRate: number;
  groupAttendanceStats: AttendanceGroupStat[];
  unassigned: AttendanceGroupStat;
  eventTrend: AttendanceEventTrendStat[];
  aggregateGroupStats: AttendanceAggregateGroupStat[];
  eventGroupTrend: AttendanceEventGroupTrendStat[];
};

export type GlobalAppStats = {
  dashboardMetrics: DashboardMetrics;
  statisticsSummary: StatisticsSummary;
  groupPage: GroupPageStats;
  groupAttendanceSummary: GroupAttendanceSummary[];
  attendance: AttendancePageStats;
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

export function buildGlobalAppStats(members: Member[], groups: Group[], attendanceEvents: AttendanceEvent[], selectedEventId?: string): GlobalAppStats {
  const visibleMembers = members.filter((member) => !isMergedPlaceholderMember(member));
  const activeMembers = visibleMembers.filter((member) => member.status !== "inactive");
  const attendanceMembers = visibleMembers.filter((member) => isAttendanceStatsMember(member));
  const dashboardMetrics = buildDashboardMetrics(members, groups);
  const selectedEvent = attendanceEvents.find((event) => event.id === selectedEventId) ?? attendanceEvents[0];
  const currentPresentCount = attendanceMembers.filter((member) => isPresentForEvent(member, selectedEvent?.id)).length;
  const currentExcusedCount = attendanceMembers.filter((member) => getAttendanceStatusForEvent(member, selectedEvent?.id) === "excused").length;
  const currentAbsentCount = Math.max(attendanceMembers.length - currentPresentCount - currentExcusedCount, 0);

  return {
    dashboardMetrics,
    statisticsSummary: buildStatisticsSummary(activeMembers),
    groupPage: buildGroupPageStats(activeMembers, groups),
    groupAttendanceSummary: buildDashboardGroupAttendanceSummary(attendanceMembers, groups, attendanceEvents),
    attendance: {
      activeMemberCount: attendanceMembers.length,
      currentPresentCount,
      currentExcusedCount,
      currentAbsentCount,
      currentAttendanceRate: attendanceMembers.length ? Math.round((currentPresentCount / attendanceMembers.length) * 100) : 0,
      groupAttendanceStats: buildCurrentGroupAttendanceStats(attendanceMembers, groups, selectedEvent?.id),
      unassigned: buildCurrentAttendanceGroupStat(
        "unassigned",
        "미배정",
        attendanceMembers.filter((member) => !member.groupId),
        selectedEvent?.id,
      ),
      eventTrend: buildEventTrendStats(attendanceMembers, attendanceEvents, selectedEvent?.id, currentPresentCount),
      aggregateGroupStats: buildAggregateAttendanceGroupStats(attendanceMembers, groups, attendanceEvents),
      eventGroupTrend: buildEventGroupTrendStats(attendanceMembers, groups, attendanceEvents),
    },
  };
}

function buildStatisticsSummary(members: Member[]): StatisticsSummary {
  const genderCounts = countByLabels(members, ["남", "여", "미입력"], (member) => {
    const gender = getCustomFieldString(member, "gender");
    return gender === "남" || gender === "여" ? gender : "미입력";
  });
  const ageCounts = countByLabels(members, ["10대", "20대", "30대", "40대 이상", "미입력"], getAgeBucketLabel);
  const jobCounts = countByLabels(members, ["학생", "사회인", "기타", "미입력"], getJobBucketLabel);
  const ministryCounts = buildMinistrySummaryRows(members);

  return {
    totalMembers: members.length,
    gender: toStatRows(genderCounts, members.length),
    age: toStatRows(ageCounts, members.length),
    job: toStatRows(jobCounts, members.length),
    ministry: ministryCounts,
  };
}

function buildGroupPageStats(members: Member[], groups: Group[]): GroupPageStats {
  const assignedMembers = members.filter((member) => member.groupId);
  return {
    activeMembers: members.length,
    assignedMembers: assignedMembers.length,
    unassignedMembers: members.length - assignedMembers.length,
    assignedLeaderCount: groups.filter((group) => group.leaderMemberId).length,
    groups: groups.map((group) => {
      const groupMembers = members.filter((member) => member.groupId === group.id);
      return {
        id: group.id,
        memberCount: groupMembers.length,
        careCount: groupMembers.filter(
          (member) => member.status === "care" || member.careFollowups.some((followup) => followup.status !== "resolved"),
        ).length,
      };
    }),
  };
}

function buildDashboardGroupAttendanceSummary(members: Member[], groups: Group[], attendanceEvents: AttendanceEvent[]): GroupAttendanceSummary[] {
  const worshipEvents = attendanceEvents.filter((event) => event.title === "주일 예배");
  const groupMeetingEvents = attendanceEvents.filter((event) => event.title === "순모임");

  return groups.map((group) => {
    const groupMembers = members.filter((member) => member.groupId === group.id);
    const worship = buildGroupAttendanceRates(groupMembers, worshipEvents);
    const groupMeeting = buildGroupAttendanceRates(groupMembers, groupMeetingEvents);
    return {
      id: group.id,
      latestWorshipRate: worship.latestRate,
      averageWorshipRate: worship.averageRate,
      latestGroupMeetingRate: groupMeeting.latestRate,
      averageGroupMeetingRate: groupMeeting.averageRate,
    };
  });
}

function buildGroupAttendanceRates(members: Member[], events: AttendanceEvent[]) {
  const latestEvent = events[0];
  const latestRate = latestEvent ? calculateEventAttendanceRate(members, latestEvent.id) : null;
  const possibleCount = members.length * events.length;
  if (!possibleCount) return { latestRate, averageRate: null };
  const eventIds = new Set(events.map((event) => event.id));
  let presentCount = 0;
  for (const member of members) {
    for (const record of member.attendanceHistory) {
      if (eventIds.has(record.eventId) && record.status === "present") presentCount += 1;
    }
  }
  return { latestRate, averageRate: Math.round((presentCount / possibleCount) * 100) };
}

function buildCurrentGroupAttendanceStats(members: Member[], groups: Group[], eventId?: string): AttendanceGroupStat[] {
  return groups.map((group) =>
    buildCurrentAttendanceGroupStat(
      group.id,
      group.name,
      members.filter((member) => member.groupId === group.id),
      eventId,
    ),
  );
}

function buildCurrentAttendanceGroupStat(id: string, name: string, members: Member[], eventId?: string): AttendanceGroupStat {
  const presentCount = members.filter((member) => isPresentForEvent(member, eventId)).length;
  return {
    id,
    name,
    presentCount,
    totalCount: members.length,
    rate: members.length ? Math.round((presentCount / members.length) * 100) : 0,
  };
}

function buildEventTrendStats(
  members: Member[],
  attendanceEvents: AttendanceEvent[],
  selectedEventId: string | undefined,
  currentPresentCount: number,
): AttendanceEventTrendStat[] {
  return attendanceEvents.map((event) => {
    const presentCount =
      event.id === selectedEventId
        ? currentPresentCount
        : members.filter((member) => isPresentForEvent(member, event.id)).length;
    return {
      ...event,
      presentCount,
      rate: members.length ? Math.round((presentCount / members.length) * 100) : 0,
    };
  });
}

function buildAggregateAttendanceGroupStats(members: Member[], groups: Group[], attendanceEvents: AttendanceEvent[]) {
  const eventTypes = ["all", ...new Set(attendanceEvents.map((event) => event.title))];
  return eventTypes.flatMap((eventType) => {
    const filteredEvents = eventType === "all" ? attendanceEvents : attendanceEvents.filter((event) => event.title === eventType);
    const eventIds = new Set(filteredEvents.map((event) => event.id));
    return [
      ...groups.map((group) =>
        buildAggregateAttendanceStat(
          eventType,
          group.id,
          group.name,
          members.filter((member) => member.groupId === group.id),
          eventIds,
          filteredEvents.length,
        ),
      ),
      buildAggregateAttendanceStat(
        eventType,
        "unassigned",
        "미배정",
        members.filter((member) => !member.groupId),
        eventIds,
        filteredEvents.length,
      ),
    ];
  });
}

function buildEventGroupTrendStats(members: Member[], groups: Group[], attendanceEvents: AttendanceEvent[]): AttendanceEventGroupTrendStat[] {
  const groupEntries = [
    ...groups.map((group) => ({
      id: group.id,
      name: group.name,
      members: members.filter((member) => member.groupId === group.id),
    })),
    {
      id: "unassigned",
      name: "미배정",
      members: members.filter((member) => !member.groupId),
    },
  ];

  return attendanceEvents.flatMap((event) =>
    groupEntries
      .filter((group) => group.members.length > 0)
      .map((group) => {
        const presentCount = group.members.filter((member) => isPresentForEvent(member, event.id)).length;
        const excusedCount = group.members.filter((member) => getAttendanceStatusForEvent(member, event.id) === "excused").length;
        return {
          eventId: event.id,
          eventDate: event.eventDate,
          eventType: event.title,
          groupId: group.id,
          groupName: group.name,
          totalCount: group.members.length,
          presentCount,
          excusedCount,
          rate: group.members.length ? Math.round((presentCount / group.members.length) * 100) : 0,
        };
      }),
  );
}

function buildAggregateAttendanceStat(
  eventType: string,
  id: string,
  name: string,
  members: Member[],
  eventIds: Set<string>,
  eventCount: number,
): AttendanceAggregateGroupStat {
  const possibleCount = members.length * eventCount;
  let presentCount = 0;
  let excusedCount = 0;
  for (const member of members) {
    for (const record of member.attendanceHistory) {
      if (!eventIds.has(record.eventId)) continue;
      if (record.status === "present") presentCount += 1;
      if (record.status === "excused") excusedCount += 1;
    }
  }
  return {
    eventType,
    id,
    name,
    memberCount: members.length,
    possibleCount,
    presentCount,
    excusedCount,
    rate: possibleCount ? Math.round((presentCount / possibleCount) * 100) : 0,
  };
}

function isAttendanceStatsMember(member: Member) {
  return (member.status === "active" || member.status === "care") && !isMergedPlaceholderMember(member);
}

function isPresentForEvent(member: Member, eventId?: string) {
  return Boolean(eventId && member.attendanceHistory.some((record) => record.eventId === eventId && record.status === "present"));
}

function getAttendanceStatusForEvent(member: Member, eventId?: string) {
  const record = member.attendanceHistory.find((item) => item.eventId === eventId);
  return record?.status ?? "absent";
}

function calculateEventAttendanceRate(members: Member[], eventId: string) {
  if (!members.length) return 0;
  const presentCount = members.filter((member) => isPresentForEvent(member, eventId)).length;
  return Math.round((presentCount / members.length) * 100);
}

function buildMinistrySummaryRows(members: Member[]): StatSummaryRow[] {
  const uniqueAssignedMemberIds = new Set<string>();
  const teamRows = ministryOptions.map((ministry) => {
    const assignedMembers = members.filter((member) => getMemberMinistries(member).includes(ministry));
    for (const member of assignedMembers) uniqueAssignedMemberIds.add(member.id);
    return {
      label: ministry,
      count: assignedMembers.length,
      ratio: calculateRatio(assignedMembers.length, members.length),
    };
  });

  return [
    ...teamRows,
    {
      label: "총 사역자 수",
      count: uniqueAssignedMemberIds.size,
      ratio: calculateRatio(uniqueAssignedMemberIds.size, members.length),
    },
    {
      label: "미배정",
      count: Math.max(members.length - uniqueAssignedMemberIds.size, 0),
      ratio: calculateRatio(Math.max(members.length - uniqueAssignedMemberIds.size, 0), members.length),
    },
  ];
}

function countByLabels(members: Member[], labels: string[], getLabel: (member: Member) => string) {
  const counts = new Map(labels.map((label) => [label, 0]));
  for (const member of members) {
    const label = getLabel(member);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function toStatRows(counts: Map<string, number>, total: number): StatSummaryRow[] {
  return [...counts.entries()].map(([label, count]) => ({
    label,
    count,
    ratio: calculateRatio(count, total),
  }));
}

function calculateRatio(count: number, total: number) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

function getJobBucketLabel(member: Member) {
  const normalizedJob = normalizeJobValue(getCustomFieldString(member, "job"));
  if (normalizedJob === "직장인" || normalizedJob === "사회인") return "사회인";
  if (normalizedJob === "학생") return "학생";
  if (!normalizedJob) return "미입력";
  return "기타";
}

function getAgeBucketLabel(member: Member) {
  const age = Number(calculateKoreanAge(getCustomFieldString(member, "birthdate")));
  if (!Number.isFinite(age) || age <= 0) return "미입력";
  if (age < 20) return "10대";
  if (age < 30) return "20대";
  if (age < 40) return "30대";
  return "40대 이상";
}

function getMemberMinistries(member: Member) {
  return [
    normalizeMinistryValue(getCustomFieldString(member, "ministry_1")),
    normalizeMinistryValue(getCustomFieldString(member, "ministry_2")),
  ].filter(Boolean);
}

function getCustomFieldString(member: Member, key: string) {
  const value = member.customFields[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
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

    if (hasPermission(currentMember.role, "attendance:write")) {
      await ensureAttendanceEvent(supabase, {
        autoCreateSundayWorship: true,
        createdByMemberId: currentMember.id,
      });
    }
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
    const deletedAuthUsers = hasPermission(currentMember.role, "roles:manage") ? await getDeletedAuthUsers(supabase) : [];
    const importantLinks = hasPermission(currentMember.role, "links:read") ? await getImportantLinks(supabase) : [];
    const memberStatusMessages = await getMemberStatusMessages(supabase);
    const adminFeedbackMessages = await getAdminFeedbackMessages(
      supabase,
      currentMember.id,
      hasPermission(currentMember.role, "roles:manage"),
    );
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
    const globalStats = buildGlobalAppStats(
      dashboardData.members,
      dashboardData.groups,
      dashboardData.attendanceEvents,
      dashboardData.attendanceEventId,
    );

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
      deletedAuthUsers,
      importantLinks,
      memberStatusMessages,
      adminFeedbackMessages,
      customFieldDefinitions,
      dashboardMetrics: globalStats.dashboardMetrics,
      globalStats,
    };
  } catch (error) {
    return { status: "error", message: formatSupabaseError(error) };
  }
}
