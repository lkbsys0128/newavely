import { hasPermission, roles, type Role } from "@/lib/rbac";
import type {
  AdminFeedbackMessage,
  AttendanceExtraCount,
  AttendanceEvent,
  AuditLog,
  CustomFieldDefinition,
  DeletedAuthUser,
  Group,
  ImportantLink,
  Member,
  MemberLinkRequest,
  MemberStatusMessage,
  NewFamilyApplicant,
} from "@/lib/types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { scopeMembersForRole } from "@/lib/member-visibility";
import { isStatsExcludedMember } from "@/lib/member-filters";
import { getAttendanceVisibleGroups } from "@/lib/group-filters";
import { calculateKoreanAge, getMemberMinistryValues, ministryOptions, normalizeJobValue } from "@/lib/member-field-options";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ensureAttendanceEvent,
  formatSupabaseError,
  getAuditLogs,
  getAdminFeedbackMessages,
  getAttendanceExtraCounts,
  getCustomFieldDefinitions,
  getDashboardData,
  getDeletedAuthUsers,
  getImportantLinks,
  getMemberLinkRequests,
  getMemberStatusMessages,
  getNewFamilyApplicants,
  getOrCreateCurrentMember,
  getPublicDashboardData,
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
  attendanceExtraCounts: AttendanceExtraCount[];
  members: Member[];
  groups: Group[];
  memberLinkRequests: MemberLinkRequest[];
  auditLogs?: AuditLog[];
  deletedAuthUsers: DeletedAuthUser[];
  importantLinks: ImportantLink[];
  memberStatusMessages: MemberStatusMessage[];
  adminFeedbackMessages: AdminFeedbackMessage[];
  newFamilyApplicants: NewFamilyApplicant[];
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

export type InsightMember = {
  id: string;
  name: string;
  meta?: string;
};

export type BirthdayInsightMember = InsightMember & {
  day: number;
};

export type InsightBucket = {
  label: string;
  members: InsightMember[];
};

export type BirthdayMonthBucket = {
  month: number;
  label: string;
  members: BirthdayInsightMember[];
};

export type DashboardInsights = {
  statisticsSummary: StatisticsSummary;
  upcomingBirthdays: BirthdayMonthBucket[];
  birthdayMonths: BirthdayMonthBucket[];
  groupRosters: InsightBucket[];
  ministryRosters: InsightBucket[];
  jobDistribution: InsightBucket[];
  ageDistribution: InsightBucket[];
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

export type PermissionRoleCount = {
  role: Role;
  count: number;
};

export type PermissionPageStats = {
  roleCounts: PermissionRoleCount[];
  activeAdminCount: number;
  leaderAndStaffCount: number;
};

export type GlobalAppStats = {
  dashboardMetrics: DashboardMetrics;
  statisticsSummary: StatisticsSummary;
  dashboardInsights: DashboardInsights;
  groupPage: GroupPageStats;
  groupAttendanceSummary: GroupAttendanceSummary[];
  attendance: AttendancePageStats;
  permissions: PermissionPageStats;
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

type AppPageKind =
  | "dashboard"
  | "attendance"
  | "members"
  | "member-detail"
  | "profile"
  | "groups"
  | "permissions"
  | "audit"
  | "feedback"
  | "new-family"
  | "links";

type AppPageDataOptions = {
  attendanceEventId?: string;
  page?: AppPageKind;
};

export function buildDashboardMetrics(members: Member[], groups: Group[]): DashboardMetrics {
  const visibleMembers = members.filter((member) => !isStatsExcludedMember(member));
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

export function buildGlobalAppStats(
  members: Member[],
  groups: Group[],
  attendanceEvents: AttendanceEvent[],
  selectedEventId?: string,
  permissionRoleCounts?: PermissionRoleCount[],
): GlobalAppStats {
  const visibleMembers = members.filter((member) => !isStatsExcludedMember(member));
  const activeMembers = visibleMembers.filter((member) => member.status !== "inactive");
  const attendanceGroups = getAttendanceVisibleGroups(groups);
  const attendanceGroupIds = new Set(attendanceGroups.map((group) => group.id));
  const attendanceMembers = visibleMembers
    .filter((member) => isAttendanceStatsMember(member))
    .filter((member) => !member.groupId || attendanceGroupIds.has(member.groupId));
  const roleCounts =
    permissionRoleCounts ??
    (["owner", "admin", "leader", "staff", "welcome", "member"] as Role[]).map((role) => ({
      role,
      count: activeMembers.filter((member) => member.role === role).length,
    }));
  const dashboardMetrics = buildDashboardMetrics(members, groups);
  const selectedEvent = attendanceEvents.find((event) => event.id === selectedEventId) ?? attendanceEvents[0];
  const currentPresentCount = attendanceMembers.filter((member) => isPresentForEvent(member, selectedEvent?.id)).length;
  const currentExcusedCount = attendanceMembers.filter((member) => getAttendanceStatusForEvent(member, selectedEvent?.id) === "excused").length;
  const currentAbsentCount = Math.max(attendanceMembers.length - currentPresentCount - currentExcusedCount, 0);

  return {
    dashboardMetrics,
    statisticsSummary: buildStatisticsSummary(activeMembers),
    dashboardInsights: buildDashboardInsights(activeMembers, groups),
    groupPage: buildGroupPageStats(activeMembers, groups),
    groupAttendanceSummary: buildDashboardGroupAttendanceSummary(attendanceMembers, attendanceGroups, attendanceEvents),
    permissions: {
      roleCounts,
      activeAdminCount: roleCounts.find((row) => row.role === "admin")?.count ?? 0,
      leaderAndStaffCount:
        (roleCounts.find((row) => row.role === "leader")?.count ?? 0) + (roleCounts.find((row) => row.role === "staff")?.count ?? 0),
    },
    attendance: {
      activeMemberCount: attendanceMembers.length,
      currentPresentCount,
      currentExcusedCount,
      currentAbsentCount,
      currentAttendanceRate: attendanceMembers.length ? Math.round((currentPresentCount / attendanceMembers.length) * 100) : 0,
      groupAttendanceStats: buildCurrentGroupAttendanceStats(attendanceMembers, attendanceGroups, selectedEvent?.id),
      unassigned: buildCurrentAttendanceGroupStat(
        "unassigned",
        "미배정",
        attendanceMembers.filter((member) => !member.groupId),
        selectedEvent?.id,
      ),
      eventTrend: buildEventTrendStats(attendanceMembers, attendanceEvents, selectedEvent?.id, currentPresentCount),
      aggregateGroupStats: buildAggregateAttendanceGroupStats(attendanceMembers, attendanceGroups, attendanceEvents),
      eventGroupTrend: buildEventGroupTrendStats(attendanceMembers, attendanceGroups, attendanceEvents),
    },
  };
}

async function getServiceRolePermissionCounts(): Promise<PermissionRoleCount[] | undefined> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.from("members").select("role, email, status, custom_fields").neq("status", "inactive");
    if (error) throw error;

    const counts = new Map<Role, number>(roles.map((role) => [role, 0]));
    for (const member of data ?? []) {
      const role = member.role as Role;
      if (!roles.includes(role)) continue;
      const customFields = member.custom_fields && typeof member.custom_fields === "object" ? member.custom_fields : {};
      if (typeof member.email === "string" && member.email.toLowerCase().endsWith("@merged.local")) continue;
      if (customFields.test_account === true) continue;
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }

    return roles.map((role) => ({ role, count: counts.get(role) ?? 0 }));
  } catch {
    return undefined;
  }
}

export function enrichMemberStatusMessages(messages: MemberStatusMessage[], members: Member[]): MemberStatusMessage[] {
  const membersById = new Map(
    members
      .filter((member) => !isStatsExcludedMember(member))
      .map((member) => [member.id, member]),
  );

  return messages
    .map((message) => {
      const member = membersById.get(message.memberId);
      if (!member || member.status === "inactive") return null;

      return {
        ...message,
        memberName: member.displayName,
        groupName: member.groupName,
      };
    })
    .filter((message): message is MemberStatusMessage => Boolean(message));
}

function isMissingPublicDashboardDataRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  return code === "PGRST202" || code === "42883" || message.includes("get_public_dashboard_");
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

function buildDashboardInsights(members: Member[], groups: Group[]): DashboardInsights {
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name));

  return {
    statisticsSummary: buildStatisticsSummary(sortedMembers),
    upcomingBirthdays: buildUpcomingBirthdayMonths(sortedMembers),
    birthdayMonths: buildBirthdayMonths(sortedMembers),
    groupRosters: buildGroupRosters(sortedMembers, groups),
    ministryRosters: buildMinistryRosters(sortedMembers),
    jobDistribution: buildJobDistribution(sortedMembers),
    ageDistribution: buildAgeDistribution(sortedMembers),
  };
}

function buildUpcomingBirthdayMonths(members: Member[], today = new Date()): BirthdayMonthBucket[] {
  const currentMonth = today.getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const birthdayMonths = buildBirthdayMonths(members);

  return [currentMonth, nextMonth].map((month, index) => ({
    ...birthdayMonths[month - 1],
    label: index === 0 ? "이번달" : "다음달",
  }));
}

function buildBirthdayMonths(members: Member[]): BirthdayMonthBucket[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthMembers: BirthdayInsightMember[] = [];

    for (const member of members) {
      const birthdate = getCustomFieldString(member, "birthdate");
      const [, birthMonth, birthDay] = birthdate.split("-").map(Number);
      if (birthMonth !== month || !birthDay) continue;

      monthMembers.push({
        id: member.id,
        name: member.displayName,
        day: birthDay,
        meta: `${birthDay}일${member.groupName ? ` · ${member.groupName}` : ""}`,
      });
    }

    monthMembers.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));

    return { month, label: `${month}월`, members: monthMembers };
  });
}

function buildGroupRosters(members: Member[], groups: Group[]): InsightBucket[] {
  const groupBuckets = groups.map((group) => ({
    label: group.name,
    members: members
      .filter((member) => member.groupId === group.id)
      .map((member) => ({
        id: member.id,
        name: member.displayName,
        meta: member.id === group.leaderMemberId ? "리더" : undefined,
      })),
  }));

  const unassignedMembers = members
    .filter((member) => !member.groupId)
    .map((member) => ({ id: member.id, name: member.displayName, meta: "미배정" }));

  return [...groupBuckets, { label: "미배정", members: unassignedMembers }];
}

function buildMinistryRosters(members: Member[]): InsightBucket[] {
  const buckets = new Map<string, InsightMember[]>();
  for (const option of ministryOptions) buckets.set(option, []);
  buckets.set("미입력", []);

  for (const member of members) {
    const ministries = getMemberMinistryValues(member.customFields);
    const uniqueMinistries = [...new Set(ministries)];

    if (uniqueMinistries.length === 0) {
      buckets.get("미입력")?.push({ id: member.id, name: member.displayName, meta: member.groupName || undefined });
      continue;
    }

    for (const ministry of uniqueMinistries) {
      if (!buckets.has(ministry)) buckets.set(ministry, []);
      buckets.get(ministry)?.push({ id: member.id, name: member.displayName, meta: member.groupName || undefined });
    }
  }

  return [...buckets.entries()].map(([label, bucketMembers]) => ({ label, members: bucketMembers }));
}

function buildJobDistribution(members: Member[]): InsightBucket[] {
  const labels = ["학생", "사회인", "기타", "미입력"];
  const buckets = new Map(labels.map((label) => [label, [] as InsightMember[]]));

  for (const member of members) {
    const normalizedJob = normalizeJobValue(getCustomFieldString(member, "job"));
    const bucketLabel = getJobBucketLabel(member);
    buckets.get(bucketLabel)?.push({
      id: member.id,
      name: member.displayName,
      meta: bucketLabel === "기타" && normalizedJob !== "기타" ? normalizedJob : member.groupName || undefined,
    });
  }

  return labels.map((label) => ({ label, members: buckets.get(label) ?? [] }));
}

function buildAgeDistribution(members: Member[]): InsightBucket[] {
  const labels = ["10대", "20대", "30대", "40대 이상", "미입력"];
  const buckets = new Map(labels.map((label) => [label, [] as InsightMember[]]));

  for (const member of members) {
    const age = Number(calculateKoreanAge(getCustomFieldString(member, "birthdate")));
    const label = getAgeBucketLabel(member);

    buckets.get(label)?.push({
      id: member.id,
      name: member.displayName,
      meta: label === "미입력" ? member.groupName || undefined : `만 ${age}세`,
    });
  }

  return labels.map((label) => ({ label, members: buckets.get(label) ?? [] }));
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
  return (member.status === "active" || member.status === "care") && !isStatsExcludedMember(member);
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
  return getMemberMinistryValues(member.customFields);
}

function getCustomFieldString(member: Member, key: string) {
  const value = member.customFields[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export async function getAppPageData(options: AppPageDataOptions = {}): Promise<AppPageData> {
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

    let publicDashboardData = dashboardData;
    if (!hasPermission(currentMember.role, "members:write")) {
      try {
        publicDashboardData = await getPublicDashboardData(supabase, options?.attendanceEventId);
      } catch (error) {
        if (!isMissingPublicDashboardDataRpc(error)) throw error;
      }
    }
    const page = options.page ?? "dashboard";
    const canManageRoles = hasPermission(currentMember.role, "roles:manage");
    const canReadNewFamily = hasPermission(currentMember.role, "new-family:read");
    const shouldLoadCustomFields = page === "profile" || page === "member-detail";
    const shouldLoadAuditLogs = page === "audit";
    const shouldLoadDeletedAuthUsers = page === "permissions";
    const shouldLoadImportantLinks = page === "links";
    const shouldLoadMemberStatusMessages = page === "dashboard";
    const shouldLoadAdminFeedback = canManageRoles || page === "feedback";
    const shouldLoadNewFamilyApplicants = page === "new-family";
    const shouldLoadAttendanceExtraCounts = page === "attendance" && hasPermission(currentMember.role, "attendance:extras:read");
    const [
      allCustomFieldDefinitions,
      auditLogs,
      deletedAuthUsers,
      importantLinks,
      memberStatusMessagesData,
      adminFeedbackMessages,
      memberLinkRequests,
      newFamilyApplicants,
      attendanceExtraCounts,
    ] = await Promise.all([
      shouldLoadCustomFields && hasPermission(currentMember.role, "members:read")
        ? getCustomFieldDefinitions(supabase)
        : Promise.resolve([]),
      shouldLoadAuditLogs && canManageRoles ? getAuditLogs(supabase) : Promise.resolve(undefined),
      shouldLoadDeletedAuthUsers && canManageRoles ? getDeletedAuthUsers(supabase) : Promise.resolve([]),
      shouldLoadImportantLinks && hasPermission(currentMember.role, "links:read") ? getImportantLinks(supabase) : Promise.resolve([]),
      shouldLoadMemberStatusMessages ? getMemberStatusMessages(supabase) : Promise.resolve([]),
      shouldLoadAdminFeedback ? getAdminFeedbackMessages(supabase, currentMember.id, canManageRoles) : Promise.resolve([]),
      getMemberLinkRequests(supabase, currentMember.id, canManageRoles),
      shouldLoadNewFamilyApplicants && canReadNewFamily ? getNewFamilyApplicants(supabase) : Promise.resolve([]),
      shouldLoadAttendanceExtraCounts ? getAttendanceExtraCounts(supabase) : Promise.resolve([]),
    ]);
    const customFieldDefinitions = hasPermission(currentMember.role, "sensitive:read")
      ? allCustomFieldDefinitions
      : allCustomFieldDefinitions.filter((field) => !field.isSensitive);
    const memberStatusMessages = enrichMemberStatusMessages(memberStatusMessagesData, publicDashboardData.members);
    const isWelcomeAttendancePage = currentMember.role === "welcome" && page === "attendance";
    const scopedMembers = isWelcomeAttendancePage
      ? publicDashboardData.members
      : scopeMembersForRole({
          role: currentMember.role,
          currentMemberId: currentMember.id,
          groups: dashboardData.groups,
          members: dashboardData.members,
        });
    const publicPermissionRoleCounts =
      "permissionRoleCounts" in publicDashboardData ? (publicDashboardData.permissionRoleCounts as PermissionRoleCount[]) : undefined;
    const permissionRoleCounts = (await getServiceRolePermissionCounts()) ?? publicPermissionRoleCounts;
    const globalStats = buildGlobalAppStats(
      publicDashboardData.members,
      publicDashboardData.groups,
      publicDashboardData.attendanceEvents,
      publicDashboardData.attendanceEventId,
      permissionRoleCounts,
    );

    return {
      status: "ready",
      user: appUser,
      attendanceDate: dashboardData.attendanceDate,
      attendanceTitle: dashboardData.attendanceTitle,
      attendanceEventId: dashboardData.attendanceEventId,
      attendanceEvents: dashboardData.attendanceEvents,
      attendanceExtraCounts,
      members: scopedMembers,
      groups: publicDashboardData.groups,
      memberLinkRequests,
      auditLogs,
      deletedAuthUsers,
      importantLinks,
      memberStatusMessages,
      adminFeedbackMessages,
      newFamilyApplicants,
      customFieldDefinitions,
      dashboardMetrics: globalStats.dashboardMetrics,
      globalStats,
    };
  } catch (error) {
    return { status: "error", message: formatSupabaseError(error) };
  }
}
