"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createAttendanceEvent,
  createAdminFeedbackMessage,
  createCalendarEvent,
  createGroup,
  createImportantLink,
  createMember,
  convertNewFamilyApplicantToMember,
  deleteAttendanceEvent,
  deleteCalendarEvent,
  deleteGroup,
  deleteImportantLink,
  deleteMemberPermanently,
  deactivateMember,
  exportMembersToGoogleSheet,
  approveMemberLinkRequest,
  rejectMemberLinkRequest,
  reopenMemberLinkRequest,
  reactivateMember,
  renameGroup,
  restoreDeletedAuthUser,
  syncNewFamilyApplicants,
  toggleAttendance,
  toggleLeaderExtraAttendance,
  updateAttendanceExtraCounts,
  updateAttendanceReason,
  updateAdminFeedbackMessage,
  updateCalendarEvent,
  updateGroup,
  updateMember,
  updateMemberRole,
  updateNewFamilyApplicant,
  type ActionState,
} from "@/app/actions";
import { hasPermission, permissionsByRole, type Role } from "@/lib/rbac";
import { canDeleteMemberRole, canUseDeleteActions } from "@/lib/role-policy";
import type { AppUser, DashboardMetrics, GlobalAppStats } from "@/lib/app-page-data";
import type {
  AttendanceExtraCount,
  AttendanceEvent,
  AuditLog,
  CalendarEvent,
  DeletedAuthUser,
  Group,
  ImportantLink,
  Member,
  AdminFeedbackMessage,
  MemberLinkRequest,
  MemberStatusMessage,
  NewFamilyApplicant,
} from "@/lib/types";
import {
  defaultMemberFilters,
  filterMembers,
  findPotentialDuplicateMembers,
  isMergedPlaceholderMember,
  isStatsExcludedMember,
  type MemberFilters,
} from "@/lib/member-filters";
import { getAttendanceVisibleGroups } from "@/lib/group-filters";
import { isActionableLinkRequest } from "@/lib/member-link-requests";
import {
  baptismStatusOptions,
  calculateKoreanAge,
  ministryOptions,
  getMemberMinistryValues,
  normalizeBaptismStatus,
  normalizeJobValue,
} from "@/lib/member-field-options";
import { getMemberEnglishName } from "@/lib/member-names";
import { getPageEmoji } from "@/lib/ui-emojis";
import { SectionNav } from "@/components/section-nav";
import { DisclosurePanel } from "@/components/disclosure-panel";

type AppDataProps = {
  user: AppUser;
  members: Member[];
  groups: Group[];
  attendanceEvents?: AttendanceEvent[];
  calendarEvents?: CalendarEvent[];
  attendanceExtraCounts?: AttendanceExtraCount[];
  memberLinkRequests?: MemberLinkRequest[];
  deletedAuthUsers?: DeletedAuthUser[];
  importantLinks?: ImportantLink[];
  memberStatusMessages?: MemberStatusMessage[];
  adminFeedbackMessages?: AdminFeedbackMessage[];
  newFamilyApplicants?: NewFamilyApplicant[];
  dashboardMetrics?: DashboardMetrics;
  globalStats?: GlobalAppStats;
};

type AttendanceFilter = "all" | "present" | "absent" | "excused";

const communityLeaderRoleLabels = {
  clergy: "교역자",
  team_leader: "팀장",
  elder: "장로",
  deaconess: "권사",
} as const;

type CommunityLeaderRole = keyof typeof communityLeaderRoleLabels;

function getCommunityLeaderRole(member: Member): CommunityLeaderRole | "" {
  const value = member.customFields.community_leader_role;
  return value === "clergy" || value === "team_leader" || value === "elder" || value === "deaconess" ? value : "";
}

function isTeamLeaderPlusRole(role: CommunityLeaderRole | "") {
  return role === "team_leader" || role === "elder" || role === "deaconess";
}
type AttendanceStatus = "present" | "absent" | "excused";

const initialActionState: ActionState = { ok: false, message: "" };

const linkIconLabels: Record<ImportantLink["iconKey"], string> = {
  website: "NW",
  links: "LT",
  youtube: "YT",
  instagram: "IG",
  default: "GO",
};

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function DashboardOverview({
  user,
  members,
  groups,
  attendanceEvents = [],
  memberStatusMessages = [],
  dashboardMetrics,
  globalStats,
}: AppDataProps) {
  const dashboardMembers = members.filter((member) => !isStatsExcludedMember(member));
  const activeMembers = dashboardMembers.filter((member) => member.status !== "inactive");
  const localPresentCount = activeMembers.filter((member) => member.present).length;
  const metrics = dashboardMetrics ?? {
    totalMembers: dashboardMembers.length,
    activeMembers: activeMembers.length,
    inactiveMembers: dashboardMembers.length - activeMembers.length,
    presentMembers: localPresentCount,
    attendanceEligibleMembers: activeMembers.length,
    groups: groups.length,
  };
  const attendanceRate = metrics.attendanceEligibleMembers
    ? Math.round((metrics.presentMembers / metrics.attendanceEligibleMembers) * 100)
    : 0;
  const dashboardInsights = globalStats?.dashboardInsights ?? buildDashboardInsights(activeMembers, groups);
  const statisticsSummary = globalStats?.statisticsSummary ?? dashboardInsights.statisticsSummary;
  const currentMember = members.find((member) => member.authUserId === user.id) ?? members.find((member) => member.email === user.email);
  const ledGroup = currentMember ? groups.find((group) => group.leaderMemberId === currentMember.id) : undefined;
  const ownGroup = ledGroup ?? (currentMember?.groupId ? groups.find((group) => group.id === currentMember.groupId) : undefined);
  const attendanceShortcutEvent = chooseAttendanceShortcutEvent(attendanceEvents);
  const canShowAttendanceShortcut = hasPermission(user.role, "attendance:write") && ownGroup && attendanceShortcutEvent;

  return (
    <>
      <PageHeader eyebrow="2026 공동체 관리 MVP" title="대시보드" user={user} />
      <SectionNav
        items={[
          { href: "#overview-metrics", label: "요약" },
          { href: "#member-status-board", label: "한마디" },
          { href: "#statistics-summary", label: "통계" },
          { href: "#birthday-overview", label: "생일" },
          { href: "#group-roster", label: "순 배정표" },
          { href: "#ministry-roster", label: "사역팀" },
          { href: "#job-distribution", label: "직업" },
          { href: "#age-distribution", label: "연령대" },
          { href: "#group-summary", label: "순 현황" },
        ]}
      />

      {canShowAttendanceShortcut ? (
        <section className="mobile-attendance-shortcut panel">
          <div>
            <p className="eyebrow">빠른 출석 체크</p>
            <h2>내 순 출석 바로가기</h2>
            <p className="meta">
              {ownGroup.name} · {attendanceShortcutEvent.eventDate}
            </p>
          </div>
          <Link
            className="primary-button"
            href={`/attendance?eventId=${attendanceShortcutEvent.id}&groupId=${ownGroup.id}&mode=group#attendance-checklist`}
          >
            출석체크 하기
          </Link>
        </section>
      ) : null}

      <MemberStatusBoard messages={memberStatusMessages} />

      <div className="metric-grid" id="overview-metrics">
        <article className="metric-card">
          <span>전체 멤버</span>
          <strong>{metrics.totalMembers}</strong>
          <small>비활성 멤버 포함</small>
        </article>
        <article className="metric-card">
          <span>활동 멤버</span>
          <strong>{metrics.activeMembers}</strong>
          <small>출석/돌봄 기준 인원</small>
        </article>
        <article className="metric-card">
          <span>비활성화</span>
          <strong>{metrics.inactiveMembers}</strong>
          <small>기록 보존 중</small>
        </article>
        <article className="metric-card">
          <span>이번 주 출석</span>
          <strong>{attendanceRate}%</strong>
          <small>
            활동 {metrics.presentMembers}/{metrics.attendanceEligibleMembers}명 출석
          </small>
        </article>
        <article className="metric-card">
          <span>순</span>
          <strong>{metrics.groups}</strong>
          <small>리더 배정 완료</small>
        </article>
      </div>

      <DashboardStatisticsSummary summary={statisticsSummary} />
      <DashboardRosterInsights insights={dashboardInsights} />

      <div className="dashboard-layout single-panel-layout">
        <GroupSummaryPanel
          attendanceEvents={attendanceEvents}
          groupMemberStats={globalStats?.groupPage.groups}
          groupStats={globalStats?.groupAttendanceSummary}
          members={activeMembers}
          groups={groups}
        />
      </div>
    </>
  );
}

function MemberStatusBoard({ messages }: { messages: MemberStatusMessage[] }) {
  if (messages.length === 0) {
    return (
      <section className="member-status-board empty" id="member-status-board">
        <div>
          <p className="eyebrow">오늘의 한마디</p>
          <h2>아직 올라온 한마디가 없습니다</h2>
        </div>
        <Link className="secondary-button" href="/profile#today-message">
          내 한마디 쓰기
        </Link>
      </section>
    );
  }

  return (
    <section className="member-status-board" id="member-status-board" aria-label="멤버 오늘의 한마디">
      <div className="member-status-board-heading">
        <div>
          <p className="eyebrow">오늘의 한마디</p>
          <h2>최근 업데이트</h2>
        </div>
        <Link className="secondary-button" href="/profile#today-message">
          내 한마디 수정
        </Link>
      </div>
      <div className="member-status-list">
        {messages.slice(0, 8).map((message) => (
          <article className="member-status-card" key={message.memberId}>
            <div className="member-status-person">
              <strong>{message.memberName}</strong>
              <span>{message.groupName}</span>
            </div>
            <p>{message.message}</p>
            <time dateTime={message.updatedAt}>{formatStatusUpdatedAt(message.updatedAt)}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function getPacificTodayDateString() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Los_Angeles",
    year: "numeric",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function chooseAttendanceShortcutEvent(attendanceEvents: AttendanceEvent[]) {
  if (attendanceEvents.length === 0) return undefined;

  const today = getPacificTodayDateString();
  const todayEvents = attendanceEvents.filter((event) => event.eventDate === today);
  const latestDate = attendanceEvents[0]?.eventDate;
  const fallbackEvents = latestDate ? attendanceEvents.filter((event) => event.eventDate === latestDate) : attendanceEvents;
  const candidates = todayEvents.length > 0 ? todayEvents : fallbackEvents;

  return candidates.find((event) => event.title === "순모임") ?? candidates.find((event) => event.title === "주일 예배") ?? candidates[0];
}

const attendanceOverviewTitleOrder = ["주일 예배", "순모임"] as const;

function getAttendanceOverviewEvents(events: AttendanceEvent[], selectedEventId?: string) {
  return attendanceOverviewTitleOrder.flatMap((title) => {
    const matchingEvents = events.filter((event) => event.title === title);
    const selectedEvent = matchingEvents.find((event) => event.id === selectedEventId);
    const event = selectedEvent ?? matchingEvents[0];
    return event ? [event] : [];
  });
}

function buildAttendanceAbsenceUnits(events: AttendanceEvent[], eventTypeFilter: string, dateFilter: string) {
  const units = new Map<string, { eventDate: string; eventType: string; eventIds: string[] }>();
  for (const event of events) {
    if (eventTypeFilter !== "all" && event.title !== eventTypeFilter) continue;
    if (dateFilter !== "all" && event.eventDate !== dateFilter) continue;

    const key = `${event.eventDate}:${event.title}`;
    const current = units.get(key) ?? { eventDate: event.eventDate, eventType: event.title, eventIds: [] };
    current.eventIds.push(event.id);
    units.set(key, current);
  }

  return Array.from(units.values()).sort((first, second) => {
    const dateSort = second.eventDate.localeCompare(first.eventDate);
    if (dateSort !== 0) return dateSort;
    const firstOrder = attendanceOverviewTitleOrder.indexOf(first.eventType as (typeof attendanceOverviewTitleOrder)[number]);
    const secondOrder = attendanceOverviewTitleOrder.indexOf(second.eventType as (typeof attendanceOverviewTitleOrder)[number]);
    return (firstOrder === -1 ? 99 : firstOrder) - (secondOrder === -1 ? 99 : secondOrder);
  });
}

function formatStatusUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

type InsightMember = {
  id: string;
  name: string;
  meta?: string;
};

type BirthdayInsightMember = InsightMember & {
  day: number;
};

type InsightBucket = {
  label: string;
  members: InsightMember[];
};

type BirthdayMonthBucket = {
  month: number;
  label: string;
  members: BirthdayInsightMember[];
};

type DashboardInsights = {
  statisticsSummary: StatisticsSummary;
  upcomingBirthdays: BirthdayMonthBucket[];
  birthdayMonths: BirthdayMonthBucket[];
  groupRosters: InsightBucket[];
  ministryRosters: InsightBucket[];
  jobDistribution: InsightBucket[];
  ageDistribution: InsightBucket[];
};

type StatSummaryRow = {
  label: string;
  count: number;
  ratio: number;
};

type StatisticsSummary = {
  totalMembers: number;
  gender: StatSummaryRow[];
  age: StatSummaryRow[];
  job: StatSummaryRow[];
  ministry: StatSummaryRow[];
};

function DashboardStatisticsSummary({ summary }: { summary: StatisticsSummary }) {
  return (
    <section className="panel statistics-panel" id="statistics-summary">
      <div className="panel-heading">
        <div>
          <h2>교적부 통계 요약</h2>
          <span>활동 멤버 {summary.totalMembers}명 기준</span>
        </div>
      </div>

      <div className="statistics-layout">
        <article className="statistics-table-card">
          <div className="statistics-table-heading">
            <strong>항목</strong>
            <span>인원 / 비율</span>
          </div>
          <StatisticsTableGroup title="성별 통계" rows={summary.gender} />
          <StatisticsTableGroup title="연령대 통계" rows={summary.age} />
          <StatisticsTableGroup title="직업별 통계" rows={summary.job} />
          <StatisticsTableGroup title="사역별 통계" rows={summary.ministry} />
        </article>

        <div className="statistics-chart-grid">
          <StatisticsBarCard title="성별 구성" rows={summary.gender} />
          <StatisticsBarCard title="연령대 분포" rows={summary.age.filter((row) => row.label !== "미입력")} />
          <StatisticsBarCard title="직업 구성" rows={summary.job} />
          <StatisticsBarCard title="사역 참여 현황" rows={summary.ministry} />
        </div>
      </div>
    </section>
  );
}

function StatisticsTableGroup({ title, rows }: { title: string; rows: StatSummaryRow[] }) {
  return (
    <div className="statistics-table-group">
      <strong>{title}</strong>
      {rows.map((row) => (
        <div className="statistics-table-row" key={row.label}>
          <span>{row.label}</span>
          <span>
            {row.count}명 · {formatPercent(row.ratio)}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatisticsBarCard({ title, rows }: { title: string; rows: StatSummaryRow[] }) {
  const visibleRows = rows.length ? rows : [{ label: "데이터 없음", count: 0, ratio: 0 }];

  return (
    <article className="statistics-chart-card">
      <h3>{title}</h3>
      <div className="statistics-bars">
        {visibleRows.map((row) => (
          <div className="statistics-bar-row" key={row.label}>
            <div className="statistics-bar-label">
              <span>{row.label}</span>
              <strong>
                {row.count}명 · {formatPercent(row.ratio)}
              </strong>
            </div>
            <div className="statistics-bar-track" aria-hidden="true">
              <span style={{ width: `${Math.max(row.ratio, row.count > 0 ? 4 : 0)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function DashboardRosterInsights({ insights }: { insights: DashboardInsights }) {
  return (
    <div className="dashboard-insights">
      <section className="panel insight-panel" id="birthday-overview">
        <div className="panel-heading">
          <div>
            <h2>월별 생일자</h2>
            <span>활동 멤버 기준</span>
          </div>
        </div>
        <div className="upcoming-birthday-grid">
          {insights.upcomingBirthdays.map((month) => (
            <article className="upcoming-birthday-card" key={`upcoming-${month.month}`}>
              <div className="mini-roster-heading">
                <strong>{month.label} 생일자</strong>
                <span>{month.members.length}명</span>
              </div>
              <MemberChipList emptyLabel="생일자 없음" members={month.members} />
            </article>
          ))}
        </div>
        <div className="birthday-month-grid">
          {insights.birthdayMonths.map((month) => (
            <article className="mini-roster-card" key={month.month}>
              <div className="mini-roster-heading">
                <strong>{month.label}</strong>
                <span>{month.members.length}명</span>
              </div>
              <MemberChipList emptyLabel="생일자 없음" members={month.members} />
            </article>
          ))}
        </div>
      </section>

      <section className="panel insight-panel" id="group-roster">
        <div className="panel-heading">
          <div>
            <h2>순 배정표</h2>
            <span>각 순 로스터</span>
          </div>
        </div>
        <div className="insight-card-grid">
          {insights.groupRosters.map((group) => (
            <RosterBucketCard bucket={group} emptyLabel="배정 멤버 없음" key={group.label} />
          ))}
        </div>
      </section>

      <section className="panel insight-panel" id="ministry-roster">
        <div className="panel-heading">
          <div>
            <h2>사역자 구성 현황</h2>
            <span>팀별 명단</span>
          </div>
        </div>
        <div className="insight-card-grid compact">
          {insights.ministryRosters.map((team) => (
            <RosterBucketCard bucket={team} emptyLabel="배정 없음" key={team.label} />
          ))}
        </div>
      </section>

      <section className="dashboard-insight-row">
        <div className="panel insight-panel" id="job-distribution">
          <div className="panel-heading">
            <div>
              <h2>직업 분포</h2>
              <span>학생/사회인 명단</span>
            </div>
          </div>
          <div className="insight-stack">
            {insights.jobDistribution.map((bucket) => (
              <RosterBucketCard bucket={bucket} emptyLabel="해당 없음" key={bucket.label} />
            ))}
          </div>
        </div>

        <div className="panel insight-panel" id="age-distribution">
          <div className="panel-heading">
            <div>
              <h2>연령대 분포</h2>
              <span>만 나이 기준</span>
            </div>
          </div>
          <div className="insight-stack">
            {insights.ageDistribution.map((bucket) => (
              <RosterBucketCard bucket={bucket} emptyLabel="해당 없음" key={bucket.label} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function RosterBucketCard({ bucket, emptyLabel }: { bucket: InsightBucket; emptyLabel: string }) {
  return (
    <article className="mini-roster-card">
      <div className="mini-roster-heading">
        <strong>{bucket.label}</strong>
        <span>{bucket.members.length}명</span>
      </div>
      <MemberChipList emptyLabel={emptyLabel} members={bucket.members} />
    </article>
  );
}

function MemberChipList({ members, emptyLabel }: { members: InsightMember[]; emptyLabel: string }) {
  if (members.length === 0) {
    return <span className="empty-mini-roster">{emptyLabel}</span>;
  }

  return (
    <div className="insight-member-list">
      {members.map((member) => (
        <span className="insight-member-chip" key={`${member.id}-${member.meta ?? ""}`}>
          {member.name}
          {member.meta ? <small>{member.meta}</small> : null}
        </span>
      ))}
    </div>
  );
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

function countByLabels(members: Member[], labels: string[], getLabel: (member: Member) => string): Map<string, number>;
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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

type CalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

type CalendarEventItem = {
  id: string;
  dateKey: string;
  type: "birthday" | "worship" | "custom";
  title: string;
  meta: string;
  href?: string;
  isPlanned?: boolean;
  sourceEvent?: CalendarEvent;
};

const calendarEventTypeLabels: Record<CalendarEvent["eventType"], string> = {
  event: "일정",
  meeting: "모임",
  notice: "공지",
};

export function CalendarPageContent({ user, members, groups, attendanceEvents = [], calendarEvents = [], globalStats }: AppDataProps) {
  const todayKey = useMemo(() => formatCalendarDateKey(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const canManageCalendar = hasPermission(user.role, "roles:manage");
  const [editingCalendarEvent, setEditingCalendarEvent] = useState<CalendarEvent | null>(null);
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string | null>(null);
  const [createCalendarEventState, createCalendarEventAction, isCreatingCalendarEvent] = useActionState(createCalendarEvent, initialActionState);
  const [updateCalendarEventState, updateCalendarEventAction, isUpdatingCalendarEvent] = useActionState(updateCalendarEvent, initialActionState);
  const [deleteCalendarEventState, deleteCalendarEventAction, isDeletingCalendarEvent] = useActionState(deleteCalendarEvent, initialActionState);
  const monthYear = visibleMonth.getFullYear();
  const monthIndex = visibleMonth.getMonth();
  const monthNumber = monthIndex + 1;
  const monthLabel = formatCalendarMonthLabel(visibleMonth);
  const birthdayMonths =
    globalStats?.dashboardInsights.birthdayMonths ??
    buildDashboardInsights(
      members.filter((member) => member.status !== "inactive" && !isStatsExcludedMember(member)),
      groups,
    ).birthdayMonths;
  const birthdaysByDay = useMemo(() => {
    const bucket = birthdayMonths[monthIndex]?.members ?? [];
    const nextMap = new Map<number, BirthdayInsightMember[]>();

    for (const member of bucket) {
      const current = nextMap.get(member.day) ?? [];
      current.push(member);
      nextMap.set(member.day, current);
    }

    return nextMap;
  }, [birthdayMonths, monthIndex]);
  const worshipEventsByDate = useMemo(() => {
    const nextMap = new Map<string, AttendanceEvent>();

    for (const event of attendanceEvents) {
      if (event.title !== "주일 예배") continue;
      if (!nextMap.has(event.eventDate)) nextMap.set(event.eventDate, event);
    }

    return nextMap;
  }, [attendanceEvents]);
  const calendarDays = useMemo(() => buildCalendarDays(monthYear, monthIndex, todayKey), [monthYear, monthIndex, todayKey]);
  const eventsByDate = useMemo(() => {
    const nextMap = new Map<string, CalendarEventItem[]>();

    for (const day of calendarDays) {
      if (!day.isCurrentMonth) continue;

      const birthdays = birthdaysByDay.get(day.day) ?? [];
      for (const birthday of birthdays) {
        addCalendarEvent(nextMap, {
          id: `birthday-${day.dateKey}-${birthday.id}`,
          dateKey: day.dateKey,
          type: "birthday",
          title: birthday.name,
          meta: birthday.meta ?? `${day.day}일 생일`,
          href: canManageCalendar ? `/members?memberId=${birthday.id}` : undefined,
        });
      }

      if (day.date.getDay() === 0) {
        const worshipEvent = worshipEventsByDate.get(day.dateKey);
        addCalendarEvent(nextMap, {
          id: `worship-${day.dateKey}`,
          dateKey: day.dateKey,
          type: "worship",
          title: "주일 예배",
          meta: worshipEvent ? "출석 이벤트 연결됨" : "예정",
          href: worshipEvent && canManageCalendar ? `/attendance?eventId=${worshipEvent.id}` : canManageCalendar ? "/attendance#event-setup" : undefined,
          isPlanned: !worshipEvent,
        });
      }

      for (const event of calendarEvents.filter((calendarEvent) => calendarEvent.eventDate === day.dateKey)) {
        addCalendarEvent(nextMap, {
          id: `calendar-${event.id}`,
          dateKey: event.eventDate,
          type: "custom",
          title: event.title,
          meta: calendarEventTypeLabels[event.eventType],
          sourceEvent: event,
        });
      }
    }

    return nextMap;
  }, [birthdaysByDay, calendarDays, calendarEvents, canManageCalendar, worshipEventsByDate]);
  const monthEvents = useMemo(
    () =>
      [...eventsByDate.values()]
        .flat()
        .sort((first, second) => first.dateKey.localeCompare(second.dateKey) || calendarEventSortOrder(first) - calendarEventSortOrder(second)),
    [eventsByDate],
  );
  const birthdayEventCount = monthEvents.filter((event) => event.type === "birthday").length;
  const worshipEventCount = monthEvents.filter((event) => event.type === "worship").length;
  const customEventCount = monthEvents.filter((event) => event.type === "custom").length;
  const selectedCalendarDayEvents = selectedCalendarDateKey ? (eventsByDate.get(selectedCalendarDateKey) ?? []) : [];

  function moveMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function showToday() {
    const today = new Date();
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <>
      <PageHeader eyebrow="공동체 일정" title="캘린더" user={user}>
        <span className="status-pill active">{monthNumber}월 일정</span>
      </PageHeader>

      <SectionNav
        items={[
          { href: "#calendar-month", label: "월간" },
          { href: "#calendar-list", label: "일정 목록" },
        ]}
      />

      <section className="calendar-layout" id="calendar-month">
        <div className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div className="calendar-title-block">
              <span>Birthdays & Worship</span>
              <strong>{monthLabel}</strong>
            </div>
            <div className="calendar-controls" aria-label="캘린더 월 이동">
              <button className="secondary-button compact-button" type="button" onClick={() => moveMonth(-1)}>
                이전
              </button>
              <button className="secondary-button compact-button" type="button" onClick={showToday}>
                오늘
              </button>
              <button className="secondary-button compact-button" type="button" onClick={() => moveMonth(1)}>
                다음
              </button>
            </div>
          </div>

          <div className="calendar-month-scroll">
            <div className="calendar-weekdays" aria-hidden="true">
              {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="calendar-month-grid">
              {calendarDays.map((day) => {
                const events = eventsByDate.get(day.dateKey) ?? [];
                return (
                  <button
                    aria-label={`${formatCalendarFullDate(day.dateKey)} 일정 ${events.length}개 보기`}
                    className={`calendar-day-card${day.isCurrentMonth ? "" : " outside"}${day.isToday ? " today" : ""}${events.length ? "" : " no-events"}`}
                    disabled={!events.length}
                    key={day.dateKey}
                    onClick={() => setSelectedCalendarDateKey(day.dateKey)}
                    type="button"
                  >
                    <div className="calendar-day-heading">
                      <strong>{day.day}</strong>
                      {day.isToday ? <span>오늘</span> : null}
                    </div>
                    <div className="calendar-event-stack">
                      {events.slice(0, 3).map((event) => (
                        <CalendarEventBadge canManage={false} event={event} key={event.id} />
                      ))}
                      {events.length > 3 ? <span className="calendar-more-event">+{events.length - 3}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="calendar-summary-panel">
          <article className="panel calendar-mini-panel">
            <div className="panel-heading">
              <div>
                <h2>이번 달 요약</h2>
                <span>{monthLabel}</span>
              </div>
            </div>
            <div className="calendar-summary-grid">
              <div>
                <span>생일</span>
                <strong>{birthdayEventCount}</strong>
              </div>
              <div>
                <span>주일 예배</span>
                <strong>{worshipEventCount}</strong>
              </div>
              <div>
                <span>직접 일정</span>
                <strong>{customEventCount}</strong>
              </div>
            </div>
          </article>

          {canManageCalendar ? (
            <article className="panel calendar-mini-panel calendar-event-editor">
              <div className="panel-heading">
                <div>
                  <h2>{editingCalendarEvent ? "일정 수정" : "일정 추가"}</h2>
                  <span>관리자 전용</span>
                </div>
              </div>
              <form action={editingCalendarEvent ? updateCalendarEventAction : createCalendarEventAction} className="calendar-event-form">
                {editingCalendarEvent ? <input name="id" type="hidden" value={editingCalendarEvent.id} /> : null}
                <label>
                  날짜
                  <input name="eventDate" type="date" defaultValue={editingCalendarEvent?.eventDate ?? todayKey} required />
                </label>
                <label>
                  종류
                  <select name="eventType" defaultValue={editingCalendarEvent?.eventType ?? "event"}>
                    <option value="event">일정</option>
                    <option value="meeting">모임</option>
                    <option value="notice">공지</option>
                  </select>
                </label>
                <label className="full-width">
                  이름
                  <input name="title" placeholder="예: 여름 수련회" defaultValue={editingCalendarEvent?.title ?? ""} required />
                </label>
                <label className="full-width">
                  설명
                  <textarea name="description" placeholder="필요한 설명을 짧게 남겨주세요." defaultValue={editingCalendarEvent?.description ?? ""} />
                </label>
                <div className="calendar-editor-actions full-width">
                  {editingCalendarEvent ? (
                    <button className="secondary-button" type="button" onClick={() => setEditingCalendarEvent(null)}>
                      취소
                    </button>
                  ) : null}
                  <button className="primary-button" type="submit" disabled={isCreatingCalendarEvent || isUpdatingCalendarEvent}>
                    {editingCalendarEvent ? "수정 저장" : "일정 추가"}
                  </button>
                </div>
                <ActionMessage state={editingCalendarEvent ? updateCalendarEventState : createCalendarEventState} />
              </form>
            </article>
          ) : null}

          <article className="panel calendar-mini-panel" id="calendar-list">
            <div className="panel-heading">
              <div>
                <h2>일정 목록</h2>
                <span>날짜순으로 정리</span>
              </div>
            </div>
            <div className="calendar-list">
              {monthEvents.length ? (
                monthEvents.map((event) => (
                  <div className="calendar-list-row" key={`${event.dateKey}-${event.id}`}>
                    <div>
                      <strong>{formatCalendarListDate(event.dateKey)}</strong>
                      <CalendarEventBadge canManage={canManageCalendar} event={event} />
                      {canManageCalendar && event.sourceEvent ? (
                        <div className="calendar-list-actions">
                          <button className="secondary-button compact-button" type="button" onClick={() => setEditingCalendarEvent(event.sourceEvent ?? null)}>
                            수정
                          </button>
                          <form action={deleteCalendarEventAction}>
                            <input name="id" type="hidden" value={event.sourceEvent.id} />
                            <button className="danger-text-button compact-button" type="submit" disabled={isDeletingCalendarEvent}>
                              삭제
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state compact-empty-state">이번 달에 표시할 일정이 없습니다.</div>
              )}
            </div>
            <ActionMessage state={deleteCalendarEventState} />
          </article>
        </aside>
      </section>

      {selectedCalendarDateKey ? (
        <div className="confirm-modal-backdrop" role="presentation" onClick={() => setSelectedCalendarDateKey(null)}>
          <div
            aria-labelledby="calendar-day-modal-title"
            aria-modal="true"
            className="panel calendar-day-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-heading">
              <div>
                <span>날짜 상세</span>
                <h2 id="calendar-day-modal-title">{formatCalendarFullDate(selectedCalendarDateKey)}</h2>
              </div>
              <button className="secondary-button compact-button" type="button" onClick={() => setSelectedCalendarDateKey(null)}>
                닫기
              </button>
            </div>

            {selectedCalendarDayEvents.length ? (
              <div className="calendar-day-detail-list">
                {selectedCalendarDayEvents.map((event) => (
                  <article className={`calendar-day-detail-item ${event.type}`} key={event.id}>
                    <div>
                      <span className="calendar-day-detail-type">
                        <strong>{calendarEventKindLabel(event)}</strong>
                        <span>{event.meta}</span>
                      </span>
                      <strong>{event.title}</strong>
                      {event.sourceEvent?.description ? <p>{event.sourceEvent.description}</p> : null}
                      {event.isPlanned ? <p>아직 출석 이벤트가 생성되지 않은 예정 일정입니다.</p> : null}
                    </div>
                    {event.href && canManageCalendar ? (
                      <Link className="secondary-button compact-button" href={event.href} onClick={() => setSelectedCalendarDateKey(null)}>
                        열기
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty-state">이 날짜에는 표시할 일정이 없습니다.</div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function CalendarEventBadge({ event, canManage }: { event: CalendarEventItem; canManage: boolean }) {
  const content = (
    <>
      <span className="calendar-event-dot" aria-hidden="true" />
      <span className="calendar-event-title">{event.title}</span>
      <small>{event.meta}</small>
      {event.isPlanned ? <em>예정</em> : null}
    </>
  );

  if (event.href && canManage) {
    return (
      <Link className={`calendar-event ${event.type}`} href={event.href}>
        {content}
      </Link>
    );
  }

  return <span className={`calendar-event ${event.type}`}>{content}</span>;
}

function buildCalendarDays(year: number, monthIndex: number, todayKey: string): CalendarDay[] {
  const firstDay = new Date(year, monthIndex, 1);
  const startDate = new Date(year, monthIndex, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = formatCalendarDateKey(date);

    return {
      date,
      dateKey,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
      isToday: dateKey === todayKey,
    };
  });
}

function addCalendarEvent(eventsByDate: Map<string, CalendarEventItem[]>, event: CalendarEventItem) {
  const current = eventsByDate.get(event.dateKey) ?? [];
  current.push(event);
  eventsByDate.set(event.dateKey, current);
}

function calendarEventSortOrder(event: CalendarEventItem) {
  if (event.type === "worship") return 0;
  if (event.type === "custom") return 1;
  return 2;
}

function calendarEventKindLabel(event: CalendarEventItem) {
  if (event.type === "birthday") return "생일";
  if (event.type === "worship") return "주일 예배";
  return event.meta;
}

function formatCalendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCalendarMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(date);
}

function formatCalendarListDate(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function formatCalendarFullDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function MembersManager({ user, members, groups }: AppDataProps) {
  const [filters, setFilters] = useState<MemberFilters>(defaultMemberFilters);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberDetailMessageMemberId, setMemberDetailMessageMemberId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showSheetLinkModal, setShowSheetLinkModal] = useState(false);
  const [createMemberState, createMemberAction, isCreatingMember] = useActionState(createMember, initialActionState);
  const [updateMemberState, updateMemberAction, isUpdatingMember] = useActionState(updateMember, initialActionState);
  const [deactivateMemberState, deactivateMemberAction, isDeactivatingMember] = useActionState(
    deactivateMember,
    initialActionState,
  );
  const [reactivateMemberState, reactivateMemberAction, isReactivatingMember] = useActionState(
    reactivateMember,
    initialActionState,
  );
  const [deleteMemberState, deleteMemberAction, isDeletingMember] = useActionState(deleteMemberPermanently, initialActionState);
  const [exportMembersState, exportMembersAction, isExportingMembers] = useActionState(
    exportMembersToGoogleSheet,
    initialActionState,
  );
  const canManageMembers = hasPermission(user.role, "members:write");
  const canManageRoles = hasPermission(user.role, "roles:manage");
  const canExportMembers = hasPermission(user.role, "members:write");
  const assignableRoleEntries = getAssignableRoleEntries(user.role);
  const isSoonjang = user.role === "staff";
  const visibleMembers = (showInactive ? members : members.filter((member) => member.status !== "inactive")).filter(
    (member) => !isMergedPlaceholderMember(member),
  );
  const duplicateMemberCandidates = useMemo(
    () => findPotentialDuplicateMembers(members.filter((member) => !isMergedPlaceholderMember(member))),
    [members],
  );
  const selectedMember = visibleMembers.find((member) => member.id === selectedMemberId) ?? null;
  const canDeleteSelectedMember = selectedMember
    ? canDeleteMemberRole({ actorRole: user.role, targetRole: selectedMember.role })
    : false;
  const filteredMembers = useMemo(() => {
    return filterMembers(visibleMembers, filters);
  }, [visibleMembers, filters]);
  const hasActiveFilters =
    filters.query !== "" ||
    filters.groupId !== "all" ||
    filters.role !== "all" ||
    filters.status !== "all" ||
    filters.account !== "all";
  const exportedSheetUrl =
    typeof exportMembersState.data?.spreadsheetUrl === "string" ? exportMembersState.data.spreadsheetUrl : "";

  useEffect(() => {
    if (exportMembersState.ok && exportedSheetUrl) {
      setShowSheetLinkModal(true);
    }
  }, [exportMembersState.ok, exportedSheetUrl]);

  function updateFilters(nextFilters: Partial<MemberFilters>) {
    setFilters((current) => ({ ...current, ...nextFilters }));
  }

  function openMemberDetail(memberId: string) {
    setSelectedMemberId(memberId);
    setMemberDetailMessageMemberId(null);
  }

  function closeMemberDetail() {
    setSelectedMemberId("");
    setMemberDetailMessageMemberId(null);
  }

  return (
    <>
      <PageHeader eyebrow="멤버 관리" title="멤버" user={user}>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          비활성화 포함
        </label>
        <form action={exportMembersAction} className="header-action-form">
          <button className="secondary-button" type="submit" disabled={!canExportMembers || isExportingMembers}>
            Google Sheet로 내보내기
          </button>
        </form>
      </PageHeader>
      <ActionMessage state={exportMembersState} />
      {showSheetLinkModal && exportedSheetUrl ? (
        <div className="confirm-modal-backdrop" role="presentation" onClick={() => setShowSheetLinkModal(false)}>
          <div
            aria-labelledby="sheet-export-title"
            aria-modal="true"
            className="confirm-modal sheet-link-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-copy">
              <span className="status-pill active">내보내기 완료</span>
              <h2 id="sheet-export-title">Google Sheet를 확인할까요?</h2>
              <p>
                교적부 내보내기가 완료되었습니다. 연결된 Google Sheet를 새 탭에서 열어 확인할 수 있습니다.
              </p>
            </div>
            <div className="confirm-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setShowSheetLinkModal(false)}>
                취소
              </button>
              <a
                className="primary-button"
                href={exportedSheetUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setShowSheetLinkModal(false)}
              >
                확인
              </a>
            </div>
          </div>
        </div>
      ) : null}
      <SectionNav
        items={[
          { href: "#member-create", label: "새 멤버" },
          { href: "#member-filters", label: "필터" },
          { href: "#member-list", label: "목록" },
          { href: "#duplicate-candidates", label: "중복 후보" },
        ]}
      />

      <DisclosurePanel
        id="member-create"
        title="멤버 추가"
        meta={canManageMembers ? "필수 정보만 먼저 입력" : "관리자/리더 권한 필요"}
      >
        <form action={createMemberAction} className="member-form">
          <label>
            한국 이름
            <input name="name" required placeholder="예: 김하은" disabled={!canManageMembers} />
          </label>
          <label>
            영어 이름
            <input name="englishName" placeholder="예: Grace" disabled={!canManageMembers} />
          </label>
          <label>
            연락처
            <input name="phone" required placeholder="010-0000-0000" disabled={!canManageMembers} />
          </label>
          <label>
            이메일
            <input name="email" type="email" placeholder="name@example.com" disabled={!canManageMembers} />
          </label>
          <label>
            순
            <select name="groupId" disabled={!canManageMembers}>
              <option value="">미배정</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            주소
            <input name="address" placeholder="주소" disabled={!canManageMembers} />
          </label>
          <label>
            공동체 리더 구분
            <select name="communityLeaderRole" defaultValue="" disabled={!canManageMembers}>
              <option value="">해당 없음</option>
              {Object.entries(communityLeaderRoleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            세례/등록
            <BaptismStatusSelect value="" disabled={!canManageMembers} />
          </label>
          <label>
            메모
            <input name="notes" placeholder="돌봄 메모" disabled={!canManageMembers} />
          </label>
          <label>
            역할
            <select name="role" defaultValue="member" disabled={!canManageRoles}>
              {assignableRoleEntries.map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
            {!canManageRoles ? <input name="role" type="hidden" value="member" /> : null}
          </label>
          <label>
            상태
            <select name="status" disabled={!canManageMembers}>
              <option value="active">활동</option>
              <option value="new">새가족</option>
              <option value="care">돌봄 필요</option>
            </select>
          </label>
          {canManageRoles ? (
            <label className="toggle-field full-width">
              <input name="isTestAccount" type="checkbox" />
              테스트 계정으로 표시하고 모든 통계에서 제외
            </label>
          ) : null}
          <div className="form-actions full-width">
            <ActionMessage state={createMemberState} />
            <button className="primary-button" type="submit" disabled={!canManageMembers || isCreatingMember}>
              추가
            </button>
          </div>
        </form>
      </DisclosurePanel>

      <section className="panel filter-panel" id="member-filters">
        <label className="search-field member-filter-search">
          <span>검색</span>
          <input
            type="search"
            placeholder="이름, 연락처, 순, 메모"
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
          />
        </label>
        <div className="filter-grid">
          <label>
            순
            <select value={filters.groupId} onChange={(event) => updateFilters({ groupId: event.target.value })}>
              <option value="all">전체 순</option>
              <option value="unassigned">미배정</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            역할
            <select value={filters.role} onChange={(event) => updateFilters({ role: event.target.value as MemberFilters["role"] })}>
              <option value="all">전체 역할</option>
              {Object.entries(roleLabels).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            상태
            <select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value as MemberFilters["status"] })}>
              <option value="all">전체 상태</option>
              {Object.entries(statusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            계정
            <select value={filters.account} onChange={(event) => updateFilters({ account: event.target.value as MemberFilters["account"] })}>
              <option value="all">전체 계정</option>
              <option value="connected">Google 연결</option>
              <option value="unconnected">미연결</option>
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={!hasActiveFilters}
            onClick={() => setFilters(defaultMemberFilters)}
            type="button"
          >
            필터 초기화
          </button>
        </div>
      </section>

      <section className="content-grid member-list-layout">
        <section className="panel wide" id="member-list">
          <div className="panel-heading">
            <h2>멤버 목록</h2>
          <span>{filteredMembers.length}명</span>
        </div>
        <div className="table-wrap">
          <table className="member-list-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>순</th>
                {!isSoonjang ? <th>역할</th> : null}
                {!isSoonjang ? <th>상태</th> : null}
                {!isSoonjang ? <th>계정</th> : null}
                {!isSoonjang ? <th>연락처</th> : null}
                <th>상세</th>
              </tr>
            </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    className={selectedMemberId === member.id ? "selected-row" : ""}
                    key={member.id}
                    onClick={() => openMemberDetail(member.id)}
                  >
                    <td>
                      <div className="member-name-cell">
                        <strong>{member.displayName}</strong>
                        <MemberMinistryLabels member={member} compact />
                      </div>
                    </td>
                    <td>{member.groupName}</td>
                    {!isSoonjang ? (
                      <td>
                        <span className="role-pill">{roleLabels[member.role]}</span>
                      </td>
                    ) : null}
                    {!isSoonjang ? (
                      <td>
                        <span className={`status-pill ${member.status === "active" ? "active" : ""}`}>
                          {statusLabels[member.status]}
                        </span>
                      </td>
                    ) : null}
                    {!isSoonjang ? (
                      <td>
                        <span className={`account-pill ${member.authUserId ? "connected" : ""}`}>
                          {member.authUserId ? "Google 연결" : "미연결"}
                        </span>
                      </td>
                    ) : null}
                    {!isSoonjang ? <td>{member.phone}</td> : null}
                    <td>
                      <button
                        className="secondary-button table-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          openMemberDetail(member.id);
                        }}
                        type="button"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={isSoonjang ? 3 : 7}>
                      <div className="empty-table-state">
                        <strong>조건에 맞는 멤버가 없습니다</strong>
                        <span>검색어 또는 필터를 조금 넓혀보세요.</span>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {selectedMember ? (
          <button
            aria-label="멤버 상세 닫기"
            className="member-detail-backdrop"
            onClick={closeMemberDetail}
            type="button"
          />
        ) : null}
        <aside
          aria-modal={selectedMember ? "true" : undefined}
          className={`panel member-detail-modal ${selectedMember ? "open" : ""}`}
          id="member-detail"
          role={selectedMember ? "dialog" : undefined}
        >
          <div className="panel-heading">
            <h2>멤버 상세</h2>
            <button className="secondary-button table-action" type="button" onClick={closeMemberDetail}>
              닫기
            </button>
          </div>
          {selectedMember ? (
            <div className="member-detail-ministry-summary">
              <span className="field-note">사역팀</span>
              <MemberMinistryLabels member={selectedMember} showEmpty />
            </div>
          ) : null}
          {selectedMember ? (
            <form
              action={updateMemberAction}
              className="management-form"
              key={selectedMember.id}
              onSubmit={() => setMemberDetailMessageMemberId(selectedMember.id)}
            >
              <input name="id" type="hidden" value={selectedMember.id} />
              <label>
                한국 이름
                <input name="name" required defaultValue={selectedMember.name} disabled={!canManageMembers} />
              </label>
              <label>
                영어 이름
                <input
                  name="englishName"
                  defaultValue={typeof selectedMember.customFields.english_name === "string" ? selectedMember.customFields.english_name : ""}
                  disabled={!canManageMembers}
                  placeholder="예: Daniel"
                />
              </label>
              <label>
                이메일
                <input name="email" type="email" defaultValue={selectedMember.email} disabled={!canManageMembers} />
              </label>
              <label>
                연락처
                <input name="phone" required defaultValue={selectedMember.phone} disabled={!canManageMembers} />
              </label>
              <label>
                순
                <select name="groupId" defaultValue={selectedMember.groupId ?? ""} disabled={!canManageMembers}>
                  <option value="">미배정</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                역할
                <select name="role" defaultValue={selectedMember.role} disabled={!canManageRoles}>
                  {assignableRoleEntries.map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
                {!canManageRoles ? <input name="role" type="hidden" value={selectedMember.role} /> : null}
              </label>
              <label>
                상태
                <select name="status" defaultValue={selectedMember.status} disabled={!canManageMembers}>
                  <option value="active">활동</option>
                  <option value="new">새가족</option>
                  <option value="care">돌봄 필요</option>
                  <option value="inactive">비활성화</option>
                </select>
              </label>
              {canManageRoles ? (
                <label className="toggle-field full-width">
                  <input
                    name="isTestAccount"
                    type="checkbox"
                    defaultChecked={selectedMember.customFields.test_account === true}
                    disabled={!canManageRoles}
                  />
                  테스트 계정으로 표시하고 모든 통계에서 제외
                </label>
              ) : null}
              <label>
                주소
                <input name="address" defaultValue={selectedMember.address} disabled={!canManageMembers} />
              </label>
              <label>
                공동체 리더 구분
                <select
                  name="communityLeaderRole"
                  defaultValue={getCommunityLeaderRole(selectedMember)}
                  disabled={!canManageMembers}
                >
                  <option value="">해당 없음</option>
                  {Object.entries(communityLeaderRoleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                세례/등록
                <BaptismStatusSelect value={selectedMember.baptismStatus} disabled={!canManageMembers} />
              </label>
              <label className="full-width">
                커스텀 메모
                <textarea name="notes" defaultValue={selectedMember.notes} disabled={!canManageMembers} />
              </label>
              <MemberMinistryEditor member={selectedMember} disabled={!canManageMembers} />
              <div className="form-actions member-detail-actions full-width">
                {memberDetailMessageMemberId === selectedMember.id ? <ActionMessage state={updateMemberState} /> : null}
                <button className="primary-button" type="submit" disabled={!canManageMembers || isUpdatingMember}>
                  저장
                </button>
              </div>
            </form>
          ) : null}
          {selectedMember ? (
            <form
              action={deactivateMemberAction}
              className="single-action-form member-detail-actions"
              onSubmit={() => setMemberDetailMessageMemberId(selectedMember.id)}
            >
              <input name="id" type="hidden" value={selectedMember.id} />
              {memberDetailMessageMemberId === selectedMember.id ? <ActionMessage state={deactivateMemberState} /> : null}
              <button
                className="danger-button"
                type="submit"
                disabled={!canManageMembers || selectedMember.status === "inactive" || isDeactivatingMember}
              >
                비활성화
              </button>
            </form>
          ) : null}
          {selectedMember?.status === "inactive" ? (
            <form
              action={reactivateMemberAction}
              className="single-action-form member-detail-actions"
              onSubmit={() => setMemberDetailMessageMemberId(selectedMember.id)}
            >
              <input name="id" type="hidden" value={selectedMember.id} />
              {memberDetailMessageMemberId === selectedMember.id ? <ActionMessage state={reactivateMemberState} /> : null}
              <button className="primary-button" type="submit" disabled={!canManageMembers || isReactivatingMember}>
                다시 활성화
              </button>
            </form>
          ) : null}
          {selectedMember && canUseDeleteActions(user.role) ? (
            <form
              action={deleteMemberAction}
              className="danger-zone-form member-delete-zone"
              onSubmit={() => setMemberDetailMessageMemberId(selectedMember.id)}
            >
              <input name="id" type="hidden" value={selectedMember.id} />
              <div className="person-block">
                <strong>완전 삭제</strong>
                <span>삭제하면 이메일과 Google 연결 충돌은 사라지지만, 출석/돌봄/연결 요청 기록도 함께 정리됩니다.</span>
              </div>
              <label>
                확인을 위해 멤버 이름 입력
                <input name="confirmName" placeholder="예: 홍길동" />
              </label>
              <div className="member-delete-actions">
                {memberDetailMessageMemberId === selectedMember.id ? <ActionMessage state={deleteMemberState} /> : null}
                <button className="danger-button" type="submit" disabled={!canDeleteSelectedMember || isDeletingMember}>
                  완전히 삭제
                </button>
              </div>
            </form>
          ) : null}
        </aside>
      </section>

      <DisclosurePanel id="duplicate-candidates" title="중복/계정 연결 확인" meta={`${duplicateMemberCandidates.length}건 후보`}>
        <div className="duplicate-list">
          {duplicateMemberCandidates.map((candidate) => {
            const linkedMember = candidate.members.find((member) => member.authUserId);
            const unlinkedMembers = candidate.members.filter((member) => !member.authUserId && member.status !== "inactive");
            return (
              <article className="duplicate-card" key={candidate.key}>
                <div className="panel-heading compact-heading">
                  <div>
                    <h3>{candidate.reasonLabel}</h3>
                    <p className="meta">같은 사람일 가능성이 있는 멤버를 확인한 뒤 연결해주세요.</p>
                  </div>
                  <span>{candidate.members.length}명</span>
                </div>
                <div className="duplicate-member-list">
                  {candidate.members.map((member) => (
                    <div className="detail-row" key={member.id}>
                      <div className="person-block">
                        <strong>{member.displayName}</strong>
                        <span>
                          {member.groupName} · {member.email || "이메일 없음"} · {member.phone}
                        </span>
                      </div>
                      <div className="row-actions">
                        <span className={`status-pill ${member.status === "active" ? "active" : ""}`}>
                          {statusLabels[member.status]}
                        </span>
                        <span className={`account-pill ${member.authUserId ? "connected" : ""}`}>
                          {member.authUserId ? "Google 연결" : "미연결"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {linkedMember && unlinkedMembers.length > 0 ? (
                  <div className="merge-action-list">
                    <Link className="primary-button table-action" href="/permissions#link-requests">
                      연결 요청 확인
                    </Link>
                  </div>
                ) : (
                  <p className="meta">자동 연결 가능한 조합은 없습니다. 이름/연락처를 확인해 수동으로 정리해주세요.</p>
                )}
              </article>
            );
          })}
          {duplicateMemberCandidates.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>확인할 중복 후보가 없습니다</strong>
                <span>같은 이름이나 연락처로 겹치는 멤버가 생기면 여기에 표시됩니다.</span>
              </div>
            </article>
          ) : null}
        </div>
      </DisclosurePanel>

    </>
  );
}

function MemberMinistryEditor({ member, disabled }: { member: Member; disabled: boolean }) {
  const selectedMinistries = getMemberMinistryValues(member.customFields);
  const ministryChoices = [...new Set([...ministryOptions, ...selectedMinistries])];

  return (
    <section className="ministry-label-editor full-width" aria-label="사역팀 수정">
      <div className="ministry-label-heading">
        <div>
          <strong>사역팀</strong>
          <span>이 멤버가 섬기는 사역을 모두 선택하세요.</span>
        </div>
        <span>{selectedMinistries.length}개</span>
      </div>
      <input name="custom_ministries" type="hidden" value="" />
      <div className="ministry-label-list">
        {ministryChoices.map((ministry) => (
          <label className="ministry-label-chip" key={ministry}>
            <input
              name="custom_ministries"
              type="checkbox"
              value={ministry}
              defaultChecked={selectedMinistries.includes(ministry)}
              disabled={disabled}
            />
            <span>{ministry}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function MemberMinistryLabels({
  member,
  compact = false,
  showEmpty = false,
}: {
  member: Member;
  compact?: boolean;
  showEmpty?: boolean;
}) {
  const ministries = getMemberMinistryValues(member.customFields);

  if (ministries.length === 0) {
    return showEmpty ? <span className="member-ministry-empty">사역팀 미배정</span> : null;
  }

  return (
    <div className={`member-ministry-labels${compact ? " compact" : ""}`} aria-label={`${member.displayName} 사역팀`}>
      {ministries.map((ministry) => (
        <span className="member-ministry-label" key={ministry}>
          {ministry}
        </span>
      ))}
    </div>
  );
}

export function GroupsPageContent({ user, members, groups, globalStats }: AppDataProps) {
  const canManageGroups = hasPermission(user.role, "groups:write");
  const canDeleteGroups = canUseDeleteActions(user.role);
  const currentMember = members.find((member) => member.authUserId === user.id) ?? members.find((member) => member.email === user.email);
  const isMemberView = user.role === "member";
  const visibleGroups = isMemberView
    ? groups.filter((group) => currentMember?.groupId && group.id === currentMember.groupId)
    : groups;
  const [groupPendingDelete, setGroupPendingDelete] = useState<Group | null>(null);
  const [groupMembersModal, setGroupMembersModal] = useState<Group | null>(null);
  const [lastUpdatedGroupId, setLastUpdatedGroupId] = useState<string | null>(null);
  const [lastRenamedGroupId, setLastRenamedGroupId] = useState<string | null>(null);
  const [lastDeletedGroupId, setLastDeletedGroupId] = useState<string | null>(null);
  const [createGroupState, createGroupAction, isCreatingGroup] = useActionState(createGroup, initialActionState);
  const [updateGroupState, updateGroupAction, isUpdatingGroup] = useActionState(updateGroup, initialActionState);
  const [renameGroupState, renameGroupAction, isRenamingGroup] = useActionState(renameGroup, initialActionState);
  const [deleteGroupState, deleteGroupAction, isDeletingGroup] = useActionState(deleteGroup, initialActionState);
  const activeMembers = members
    .filter((member) => member.status !== "inactive" && !isMergedPlaceholderMember(member))
    .filter((member) => !isMemberView || (currentMember?.groupId ? member.groupId === currentMember.groupId : member.id === currentMember?.id));
  const unassignedMembers = activeMembers.filter((member) => !member.groupId);
  const assignedMembers = activeMembers.filter((member) => member.groupId);
  const assignedLeaderCount = visibleGroups.filter((group) => group.leaderMemberId).length;
  const groupStats = isMemberView ? undefined : globalStats?.groupPage;
  const groupLeaderOptions = [...activeMembers].sort((a, b) => a.name.localeCompare(b.name));
  const communityLeaderNetworkGroup = visibleGroups.find((group) => group.name.includes("공동체 리더")) ?? null;
  const networkGroups = communityLeaderNetworkGroup ? visibleGroups.filter((group) => group.id !== communityLeaderNetworkGroup.id) : visibleGroups;
  const communityLeaderMembers = communityLeaderNetworkGroup
    ? activeMembers.filter((member) => member.groupId === communityLeaderNetworkGroup.id)
    : [];
  const communityLeaderNetworkNode = communityLeaderNetworkGroup
    ? {
        group: communityLeaderNetworkGroup,
        x: 50,
        y: 12,
        memberCount: groupStats?.groups.find((item) => item.id === communityLeaderNetworkGroup.id)?.memberCount ?? communityLeaderMembers.length,
      }
    : null;
  const networkNodes = networkGroups.map((group, index) => {
    const nodeCount = Math.max(networkGroups.length, 1);
    const angle = nodeCount === 1 ? 90 : -28 + (index * 236) / (nodeCount - 1);
    const radians = (angle * Math.PI) / 180;
    const radius = nodeCount <= 5 ? 33 : 37;
    const groupMembers = activeMembers.filter((member) => member.groupId === group.id);
    return {
      group,
      x: 50 + Math.cos(radians) * radius,
      y: 50 + Math.sin(radians) * radius,
      memberCount: groupStats?.groups.find((item) => item.id === group.id)?.memberCount ?? groupMembers.length,
    };
  });
  const allNetworkNodes = communityLeaderNetworkNode ? [communityLeaderNetworkNode, ...networkNodes] : networkNodes;

  useEffect(() => {
    if (deleteGroupState.ok) {
      setGroupPendingDelete(null);
    }
  }, [deleteGroupState]);

  return (
    <>
      <PageHeader eyebrow="순 관리" title="순" user={user} />
      <SectionNav
        items={[
          { href: "#group-metrics", label: "요약" },
          ...(canManageGroups ? [{ href: "#group-create", label: "순 추가" }] : []),
          { href: "#group-network", label: "순 연결지도" },
          ...(!isMemberView ? [{ href: "#unassigned-members", label: "미배정" }] : []),
        ]}
      />
      <div className="metric-grid" id="group-metrics">
        <article className="metric-card">
          <span>전체 활동 멤버</span>
          <strong>{groupStats?.activeMembers ?? activeMembers.length}</strong>
          <small>비활성 멤버 제외</small>
        </article>
        <article className="metric-card">
          <span>순</span>
          <strong>{visibleGroups.length}</strong>
          <small>{isMemberView ? "내가 속한 순" : "현재 등록된 순"}</small>
        </article>
        <article className="metric-card">
          <span>미배정</span>
          <strong>{groupStats?.unassignedMembers ?? unassignedMembers.length}</strong>
          <small>순 배정 필요</small>
        </article>
        <article className="metric-card">
          <span>배정 완료</span>
          <strong>{groupStats?.assignedMembers ?? assignedMembers.length}</strong>
          <small>리더 {groupStats?.assignedLeaderCount ?? assignedLeaderCount}/{visibleGroups.length}명 배정</small>
        </article>
      </div>

      {canManageGroups ? (
        <DisclosurePanel
          id="group-create"
          title="순 추가"
          meta="이름과 리더를 지정"
        >
          <form action={createGroupAction} className="member-form group-create-form">
            <label>
              순 이름
              <input name="name" required placeholder="예: 은미 순" />
            </label>
            <label>
              리더
              <select name="leaderMemberId">
                <option value="">미배정</option>
                {groupLeaderOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName} · {member.groupName}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <ActionMessage state={createGroupState} />
              <button className="primary-button" type="submit" disabled={isCreatingGroup}>
                추가
              </button>
            </div>
          </form>
        </DisclosurePanel>
      ) : null}

      <section className="panel group-network-panel" id="group-network" aria-labelledby="group-network-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">공동체 네트워크</span>
            <h2 id="group-network-title">순 연결 지도</h2>
            <p className="meta">중앙의 뉴웨이브를 중심으로 각 순이 연결된 모습을 한눈에 봅니다.</p>
          </div>
          <span>{visibleGroups.length}개 순</span>
        </div>
        <div className="group-network-map" role="img" aria-label="뉴웨이브 순 연결 지도">
          <svg aria-hidden="true" className="group-network-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            {allNetworkNodes.map((node) => (
              <line className="center-line" key={`center-${node.group.id}`} x1="50" y1="50" x2={node.x} y2={node.y} />
            ))}
          </svg>
          <div className="group-network-center" aria-hidden="true">
            <img alt="" src="/newave-icon.png" />
            <strong>뉴웨이브</strong>
          </div>
          {allNetworkNodes.map((node) => (
            <button
              className={`group-network-node${node.group.id === communityLeaderNetworkGroup?.id ? " community-leader" : ""}`}
              key={node.group.id}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              type="button"
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onClick={() => setGroupMembersModal(node.group)}
            >
              <strong>{node.group.name}</strong>
              <span>순장 {node.group.leaderName}</span>
              <small>{node.memberCount}명</small>
            </button>
          ))}
        </div>
      </section>

      {groupMembersModal ? (
        <GroupMembersModal
          canDeleteGroups={canDeleteGroups}
          canManageGroups={canManageGroups}
          deleteGroupState={deleteGroupState}
          group={groupMembersModal}
          groupLeaderOptions={groupLeaderOptions}
          isDeletingGroup={isDeletingGroup}
          isRenamingGroup={isRenamingGroup}
          isUpdatingGroup={isUpdatingGroup}
          lastDeletedGroupId={lastDeletedGroupId}
          lastRenamedGroupId={lastRenamedGroupId}
          lastUpdatedGroupId={lastUpdatedGroupId}
          members={activeMembers.filter((member) => member.groupId === groupMembersModal.id)}
          onClose={() => setGroupMembersModal(null)}
          renameGroupAction={renameGroupAction}
          renameGroupState={renameGroupState}
          setGroupPendingDelete={setGroupPendingDelete}
          setLastRenamedGroupId={setLastRenamedGroupId}
          setLastUpdatedGroupId={setLastUpdatedGroupId}
          updateGroupAction={updateGroupAction}
          updateGroupState={updateGroupState}
        />
      ) : null}
      {groupPendingDelete ? (
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={() => setGroupPendingDelete(null)}
        >
          <div
            aria-labelledby="group-delete-title"
            aria-modal="true"
            className="confirm-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-copy">
              <span className="status-pill inactive">삭제 확인</span>
              <h2 id="group-delete-title">정말 지우시겠습니까?</h2>
              <p>
                <strong>{groupPendingDelete.name}</strong> 순을 삭제하면, 해당 순의 멤버들은 미배정으로 이동됩니다.
              </p>
            </div>
            <div className="confirm-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setGroupPendingDelete(null)}>
                취소
              </button>
              <form
                action={deleteGroupAction}
                onSubmit={() => {
                  setLastDeletedGroupId(groupPendingDelete.id);
                  setGroupPendingDelete(null);
                }}
              >
                <input name="id" type="hidden" value={groupPendingDelete.id} />
                <button className="danger-button" type="submit" disabled={!canDeleteGroups || isDeletingGroup}>
                  삭제
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      {!isMemberView && unassignedMembers.length > 0 ? (
        <DisclosurePanel id="unassigned-members" title="미배정 멤버" meta={`${unassignedMembers.length}명`}>
          <div className="group-member-list">
            {unassignedMembers.map((member) => (
              <Link className="member-chip" href={`/members/${member.id}`} key={member.id}>
                {member.displayName}
              </Link>
            ))}
          </div>
        </DisclosurePanel>
      ) : null}
    </>
  );
}

export function LinksPageContent({ user, importantLinks = [] }: AppDataProps) {
  const canCreateLinks = hasPermission(user.role, "links:write");
  const canDeleteLinks = user.role === "owner" || user.role === "admin";
  const [createLinkState, createLinkAction, isCreatingLink] = useActionState(createImportantLink, initialActionState);
  const [deleteLinkState, deleteLinkAction, isDeletingLink] = useActionState(deleteImportantLink, initialActionState);

  return (
    <>
      <PageHeader eyebrow="중요 링크" title="링크" user={user}>
        <span className="status-pill">{importantLinks.length}개</span>
      </PageHeader>

      <SectionNav
        items={[
          { href: "#link-list", label: "링크 목록" },
          { href: "#link-create", label: "새 링크" },
        ]}
      />

      <section className="link-hero panel">
        <div>
          <p className="eyebrow">Newave Resource Hub</p>
          <h2>자주 쓰는 사이트를 한 곳에서</h2>
          <p className="meta">공식 홈페이지, 소셜 채널, 안내 링크를 빠르게 열 수 있습니다.</p>
        </div>
      </section>

      <section className="link-grid" id="link-list" aria-label="중요 링크 목록">
        {importantLinks.map((link) => (
          <article className="link-card" key={link.id}>
            <a href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.title} 새 창에서 열기`}>
              <span className={`link-icon ${link.iconKey}`}>{linkIconLabels[link.iconKey]}</span>
              <span className="link-card-body">
                <strong>{link.title}</strong>
                <span>{link.description || getHostname(link.url)}</span>
                <small>{getHostname(link.url)}</small>
              </span>
              <span className="link-open-indicator">열기</span>
            </a>
            {canDeleteLinks ? (
              <form action={deleteLinkAction} className="link-delete-form">
                <input name="id" type="hidden" value={link.id} />
                <button className="danger-text-button" type="submit" disabled={isDeletingLink}>
                  삭제
                </button>
              </form>
            ) : null}
          </article>
        ))}
        {importantLinks.length === 0 ? (
          <article className="empty-state">
            <strong>등록된 링크가 없습니다</strong>
            <span>순장 이상 권한으로 첫 링크를 추가할 수 있습니다.</span>
          </article>
        ) : null}
      </section>
      <ActionMessage state={deleteLinkState} />

      {canCreateLinks ? (
        <section className="panel form-panel link-create-panel" id="link-create">
          <div className="panel-heading">
            <div>
              <h2>새 링크 추가</h2>
              <p className="meta">순장/리더 이상은 공동체에 필요한 링크를 추가할 수 있습니다.</p>
            </div>
          </div>
          <form action={createLinkAction} className="member-form link-form">
            <label>
              이름
              <input name="title" placeholder="예: 뉴웨이브 공식 홈페이지" required />
            </label>
            <label>
              URL
              <input name="url" type="url" placeholder="https://example.com" required />
            </label>
            <label className="full-width">
              설명
              <input name="description" placeholder="링크를 어디에 쓰는지 짧게 적어주세요" />
            </label>
            <div className="form-actions full-width">
              <button className="primary-button" type="submit" disabled={isCreatingLink}>
                {isCreatingLink ? "추가 중" : "추가"}
              </button>
            </div>
          </form>
          <ActionMessage state={createLinkState} />
        </section>
      ) : null}
    </>
  );
}

const newFamilyStatusLabels: Record<NewFamilyApplicant["status"], string> = {
  new: "새 신청",
  contacted: "연락 완료",
  week_1: "1주차",
  week_2: "2주차",
  week_3: "수료예정",
  completed: "수료/등록",
  archived: "보관",
};

const newFamilyStatusOrder: NewFamilyApplicant["status"][] = [
  "new",
  "contacted",
  "week_1",
  "week_2",
  "week_3",
  "completed",
  "archived",
];

type NewFamilySort = "latest" | "oldest" | "name" | "status";

const newFamilySortLabels: Record<NewFamilySort, string> = {
  latest: "최신순",
  oldest: "오래된순",
  name: "이름순",
  status: "상태순",
};

function getNewFamilyTimestamp(applicant: NewFamilyApplicant) {
  return new Date(applicant.submittedAt ?? applicant.createdAt ?? applicant.updatedAt).getTime() || 0;
}

function getNewFamilySourceValue(applicant: NewFamilyApplicant, keys: string[]) {
  for (const key of keys) {
    const value = applicant.sourceData[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function getNewFamilyGender(applicant: NewFamilyApplicant) {
  const gender = getNewFamilySourceValue(applicant, ["성별", "gender"]).toLowerCase();
  if (gender.includes("남") || gender.includes("male")) return "남";
  if (gender.includes("여") || gender.includes("female")) return "여";
  return "미입력";
}

function getNewFamilyAgeBand(applicant: NewFamilyApplicant) {
  const rawAge = getNewFamilySourceValue(applicant, ["만 나이", "age"]);
  const age = Number.parseInt(rawAge, 10);
  if (!Number.isFinite(age)) return "미입력";
  if (age < 20) return "10대";
  if (age < 30) return "20대";
  if (age < 40) return "30대";
  return "40대+";
}

function buildNewFamilyBreakdown<T extends string>(
  applicants: NewFamilyApplicant[],
  getLabel: (applicant: NewFamilyApplicant) => T,
  preferredOrder: T[] = [],
) {
  const counts = new Map<T, number>();
  for (const applicant of applicants) {
    const label = getLabel(applicant);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([firstLabel, firstCount], [secondLabel, secondCount]) => {
      const firstIndex = preferredOrder.indexOf(firstLabel);
      const secondIndex = preferredOrder.indexOf(secondLabel);
      if (firstIndex !== -1 || secondIndex !== -1) {
        return (firstIndex === -1 ? 999 : firstIndex) - (secondIndex === -1 ? 999 : secondIndex);
      }
      return secondCount - firstCount || firstLabel.localeCompare(secondLabel, "ko");
    })
    .map(([label, count]) => ({ label, count }));
}

function normalizeNewFamilyGroupName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getNewFamilyExpectedGroup(applicant: NewFamilyApplicant) {
  return applicant.expectedGroup || applicant.groupInterest || getNewFamilySourceValue(applicant, ["예정 순", "희망순", "관심 순", "관심순", "순"]) || "";
}

export function NewFamilyPageContent({ user, groups, newFamilyApplicants = [] }: AppDataProps) {
  const canReadNewFamily = hasPermission(user.role, "new-family:read");
  const canManageNewFamily = hasPermission(user.role, "new-family:write");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<NewFamilyApplicant["status"] | "all">("all");
  const [sortBy, setSortBy] = useState<NewFamilySort>("latest");
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [selectedStatusDraft, setSelectedStatusDraft] = useState<NewFamilyApplicant["status"]>("new");
  const [syncState, syncAction, isSyncing] = useActionState(syncNewFamilyApplicants, initialActionState);
  const [updateState, updateAction, isUpdating] = useActionState(updateNewFamilyApplicant, initialActionState);
  const [convertState, convertAction, isConverting] = useActionState(convertNewFamilyApplicantToMember, initialActionState);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleApplicants = [...newFamilyApplicants]
    .filter((applicant) => {
      if (statusFilter !== "all" && applicant.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [applicant.name, applicant.email, applicant.phone, getNewFamilyExpectedGroup(applicant), applicant.memo]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    })
    .sort((first, second) => {
      if (sortBy === "oldest") return getNewFamilyTimestamp(first) - getNewFamilyTimestamp(second);
      if (sortBy === "name") return first.name.localeCompare(second.name, "ko");
      if (sortBy === "status") {
        return newFamilyStatusOrder.indexOf(first.status) - newFamilyStatusOrder.indexOf(second.status);
      }
      return getNewFamilyTimestamp(second) - getNewFamilyTimestamp(first);
    });
  const selectedApplicant = visibleApplicants.find((applicant) => applicant.id === selectedApplicantId) ?? null;
  useEffect(() => {
    setSelectedStatusDraft(selectedApplicant?.status ?? "new");
  }, [selectedApplicant?.id, selectedApplicant?.status]);
  const statusCounts = newFamilyStatusOrder.reduce(
    (counts, status) => ({
      ...counts,
      [status]: newFamilyApplicants.filter((applicant) => applicant.status === status).length,
    }),
    {} as Record<NewFamilyApplicant["status"], number>,
  );
  const activeCount = newFamilyApplicants.filter((applicant) => applicant.status !== "completed" && applicant.status !== "archived").length;
  const readyCount = newFamilyApplicants.filter((applicant) => applicant.status === "week_3").length;
  const completedCount = newFamilyApplicants.filter((applicant) => applicant.status === "completed").length;
  const genderBreakdown = buildNewFamilyBreakdown(newFamilyApplicants, getNewFamilyGender, ["남", "여", "미입력"]);
  const ageBreakdown = buildNewFamilyBreakdown(newFamilyApplicants, getNewFamilyAgeBand, ["10대", "20대", "30대", "40대+", "미입력"]);
  const baptismBreakdown = buildNewFamilyBreakdown(
    newFamilyApplicants,
    (applicant) => getNewFamilySourceValue(applicant, ["세례 유무", "baptismStatus"]) || "미입력",
    ["세례/입교", "유아세례", "교회 처음", "세례 X", "미입력"],
  );
  const assigneeBreakdown = buildNewFamilyBreakdown(
    newFamilyApplicants,
    (applicant) => getNewFamilySourceValue(applicant, ["담당자", "assignee", "owner"]) || "미배정",
  ).slice(0, 6);
  const latestSync = newFamilyApplicants
    .map((applicant) => applicant.lastSyncedAt)
    .sort()
    .at(-1);
  const selectedExpectedGroup = selectedApplicant ? getNewFamilyExpectedGroup(selectedApplicant) : "";
  const selectedManualExpectedGroup = selectedApplicant?.expectedGroup ?? "";
  const selectedManualExpectedGroupIsExisting =
    Boolean(selectedManualExpectedGroup) &&
    groups.some((group) => normalizeNewFamilyGroupName(group.name) === normalizeNewFamilyGroupName(selectedManualExpectedGroup));
  const defaultConvertGroupId =
    groups.find((group) => normalizeNewFamilyGroupName(group.name) === normalizeNewFamilyGroupName(selectedExpectedGroup))?.id ?? "";
  const shouldGuideToMemberCreation = selectedApplicant && selectedStatusDraft === "completed" && !selectedApplicant.convertedMemberId;

  if (!canReadNewFamily) {
    return (
      <>
        <PageHeader eyebrow="새가족 관리" title="새가족" user={user} />
        <section className="panel empty-state">
          <strong>관리자 권한이 필요합니다</strong>
          <span>새가족 신청 roster는 현재 관리자 이상만 열람할 수 있습니다.</span>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="새가족 관리" title="새가족" user={user}>
        <span className="status-pill new-family-header-pill">{activeCount}건 진행 중</span>
      </PageHeader>

      <SectionNav
        items={[
          { href: "#new-family-insights", label: "통계" },
          { href: "#new-family-sync", label: "동기화" },
          { href: "#new-family-roster", label: "신청 목록" },
        ]}
      />

      <section className="panel new-family-quick-summary" aria-label="새가족 신청 핵심 요약">
        <span>
          전체 <strong>{newFamilyApplicants.length}</strong>
        </span>
        <span>
          진행 <strong>{activeCount}</strong>
        </span>
        <span>
          수료예정 <strong>{readyCount}</strong>
        </span>
        <span>
          등록 <strong>{completedCount}</strong>
        </span>
      </section>

      <section className="new-family-metrics" aria-label="새가족 신청 요약">
        <article className="metric-card">
          <span>전체 신청</span>
          <strong>{newFamilyApplicants.length}</strong>
          <small>Sheet 동기화 기준</small>
        </article>
        <article className="metric-card">
          <span>진행 중</span>
          <strong>{activeCount}</strong>
          <small>새 신청부터 수료예정까지</small>
        </article>
        <article className="metric-card">
          <span>수료예정</span>
          <strong>{readyCount}</strong>
          <small>3주차 확인 필요</small>
        </article>
        <article className="metric-card">
          <span>수료/등록</span>
          <strong>{completedCount}</strong>
          <small>멤버 roster 전환</small>
        </article>
      </section>

      <section className="new-family-insights" id="new-family-insights" aria-label="새가족 통계">
        <NewFamilyBreakdownCard title="성별" items={genderBreakdown} total={newFamilyApplicants.length} />
        <NewFamilyBreakdownCard title="연령대" items={ageBreakdown} total={newFamilyApplicants.length} />
        <NewFamilyBreakdownCard title="세례/등록" items={baptismBreakdown} total={newFamilyApplicants.length} />
        <NewFamilyBreakdownCard title="담당자" items={assigneeBreakdown} total={newFamilyApplicants.length} />
      </section>

      <section className="panel new-family-stage-panel" aria-label="새가족 상태 흐름">
        <button
          className={`new-family-stage-chip ${statusFilter === "all" ? "is-active" : ""}`}
          type="button"
          onClick={() => setStatusFilter("all")}
        >
          <span>전체</span>
          <strong>{newFamilyApplicants.length}</strong>
        </button>
        {newFamilyStatusOrder.map((status) => (
          <button
            className={`new-family-stage-chip ${statusFilter === status ? "is-active" : ""} ${status}`}
            type="button"
            key={status}
            onClick={() => setStatusFilter(status)}
          >
            <span>{newFamilyStatusLabels[status]}</span>
            <strong>{statusCounts[status]}</strong>
          </button>
        ))}
      </section>

      <section className="panel new-family-sync-panel" id="new-family-sync">
        <div>
          <p className="eyebrow">Google Form Intake</p>
          <h2>새가족 신청 Sheet와 연결</h2>
          <p className="meta">
            주 1회 자동으로 확인하고, 필요하면 여기서 즉시 동기화할 수 있습니다.
            {latestSync ? ` 마지막 동기화 ${formatShortDateTime(latestSync)}` : ""}
          </p>
        </div>
        <form action={syncAction}>
          <button className="primary-button" type="submit" disabled={isSyncing}>
            {isSyncing ? "동기화 중" : "지금 동기화"}
          </button>
        </form>
      </section>
      <ActionMessage state={syncState} />

      <section className="panel new-family-filter-panel" aria-label="새가족 신청 필터">
        <label className="new-family-control search-field">
          <span>검색</span>
          <input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, 이메일, 전화, 예정 순, 메모"
          />
        </label>
        <label className="new-family-control">
          <span>상태</span>
          <select
            autoComplete="off"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as NewFamilyApplicant["status"] | "all")}
          >
            <option value="all">전체 상태</option>
            {Object.entries(newFamilyStatusLabels).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="new-family-control">
          <span>정렬</span>
          <select
            autoComplete="off"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as NewFamilySort)}
          >
            {Object.entries(newFamilySortLabels).map(([sort, label]) => (
              <option key={sort} value={sort}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="new-family-roster-layout" id="new-family-roster">
        <section className="panel">
          <div className="panel-heading">
            <h2>새가족 신청 목록</h2>
            <span>{visibleApplicants.length}건</span>
          </div>
          <div className="table-wrap">
            <table className="member-list-table new-family-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>상태</th>
                  <th>신청일</th>
                  <th>예정 순</th>
                  <th>담당자</th>
                  <th>세례</th>
                  <th>연락처</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {visibleApplicants.map((applicant) => (
                  <tr
                    className={selectedApplicant?.id === applicant.id ? "selected-row" : ""}
                    key={applicant.id}
                    onClick={() => setSelectedApplicantId(applicant.id)}
                  >
                    <td>
                      <div className="member-name-cell">
                        <strong>{applicant.name}</strong>
                        <span className="meta">{applicant.email || "이메일 미입력"}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill new-family-status ${applicant.status}`}>{newFamilyStatusLabels[applicant.status]}</span>
                    </td>
                    <td>{applicant.submittedAt ? formatShortDateTime(applicant.submittedAt) : `Sheet ${applicant.sourceRowNumber}행`}</td>
                    <td>{getNewFamilyExpectedGroup(applicant) || "미입력"}</td>
                    <td>{getNewFamilySourceValue(applicant, ["담당자", "assignee", "owner"]) || "미배정"}</td>
                    <td>{getNewFamilySourceValue(applicant, ["세례 유무", "baptismStatus"]) || "미입력"}</td>
                    <td>{applicant.phone || "미입력"}</td>
                    <td>
                      <button
                        className="secondary-button table-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedApplicantId(applicant.id);
                        }}
                        type="button"
                      >
                        관리
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleApplicants.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-table-state">
                        <strong>{newFamilyApplicants.length === 0 ? "아직 동기화된 새가족 신청이 없습니다" : "현재 필터에 맞는 신청이 없습니다"}</strong>
                        <span>
                          {newFamilyApplicants.length === 0
                            ? "Google Sheet 공유와 Vercel 환경 변수를 확인한 뒤 지금 동기화를 눌러주세요."
                            : "검색어를 지우거나 상태 필터를 전체 상태로 바꿔보세요."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      {selectedApplicant ? (
        <div className="confirm-modal-backdrop" role="presentation" onClick={() => setSelectedApplicantId(null)}>
          <section
            aria-labelledby="new-family-modal-title"
            aria-modal="true"
            className="confirm-modal new-family-management-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">새가족 관리</p>
                <h2 id="new-family-modal-title">{selectedApplicant.name}</h2>
                <p className="meta">
                  {selectedApplicant.submittedAt ? formatShortDateTime(selectedApplicant.submittedAt) : `Sheet ${selectedApplicant.sourceRowNumber}행`}
                </p>
              </div>
              <button className="secondary-button table-action" type="button" onClick={() => setSelectedApplicantId(null)}>
                닫기
              </button>
            </div>

            <dl className="new-family-detail-list">
              <div>
                <dt>상태</dt>
                <dd>
                  <span className={`status-pill new-family-status ${selectedApplicant.status}`}>
                    {newFamilyStatusLabels[selectedApplicant.status]}
                  </span>
                </dd>
              </div>
              <div>
                <dt>이메일</dt>
                <dd>{selectedApplicant.email || "미입력"}</dd>
              </div>
              <div>
                <dt>연락처</dt>
                <dd>{selectedApplicant.phone || "미입력"}</dd>
              </div>
              <div>
                <dt>예정 순</dt>
                <dd>{getNewFamilyExpectedGroup(selectedApplicant) || "미입력"}</dd>
              </div>
              <div>
                <dt>담당자</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["담당자", "assignee", "owner"]) || "미배정"}</dd>
              </div>
              <div>
                <dt>성별</dt>
                <dd>{getNewFamilyGender(selectedApplicant)}</dd>
              </div>
              <div>
                <dt>생년월일</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["생년월일", "birthdate"]) || "미입력"}</dd>
              </div>
              <div>
                <dt>만 나이</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["만 나이", "age"]) || "미입력"}</dd>
              </div>
              <div>
                <dt>거주 지역</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["거주 지역", "address", "location"]) || "미입력"}</dd>
              </div>
              <div>
                <dt>세례/등록</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["세례 유무", "baptismStatus"]) || "미입력"}</dd>
              </div>
              <div>
                <dt>2주차 출석일</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["2주차 출석일"]) || "미입력"}</dd>
              </div>
              <div>
                <dt>3주차 출석일</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["3주차 출석일"]) || "미입력"}</dd>
              </div>
              <div>
                <dt>수료 예정일</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["수료 예정일"]) || "미입력"}</dd>
              </div>
              <div>
                <dt>비고</dt>
                <dd>{getNewFamilySourceValue(selectedApplicant, ["비고", "note", "memo"]) || selectedApplicant.memo || "미입력"}</dd>
              </div>
            </dl>

            <form action={updateAction} className="new-family-side-form" key={`update-${selectedApplicant.id}`}>
              <input name="id" type="hidden" value={selectedApplicant.id} />
              <label>
                상태
                <select
                  name="status"
                  value={selectedStatusDraft}
                  onChange={(event) => setSelectedStatusDraft(event.target.value as NewFamilyApplicant["status"])}
                >
                  {newFamilyStatusOrder.map((status) => (
                    <option key={status} value={status}>
                      {newFamilyStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                예정 순
                <select name="expectedGroup" defaultValue={selectedApplicant.expectedGroup}>
                  <option value="">
                    {selectedExpectedGroup ? `시트 값 사용 (${selectedExpectedGroup})` : "미입력"}
                  </option>
                  {selectedApplicant.expectedGroup && !selectedManualExpectedGroupIsExisting ? (
                    <option value={selectedApplicant.expectedGroup}>{selectedApplicant.expectedGroup}</option>
                  ) : null}
                  {groups.map((group) => (
                    <option key={group.id} value={group.name}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                메모
                <textarea name="memo" defaultValue={selectedApplicant.memo} placeholder="연락/수료 진행 메모" rows={4} />
              </label>
              {shouldGuideToMemberCreation ? (
                <div className="inline-help-panel success">
                  <strong>수료/등록은 멤버 로스터 등록으로 완료됩니다</strong>
                  <span>아래 정보를 확인하고 멤버로 등록하면 새가족 상태도 자동으로 수료/등록 처리됩니다.</span>
                </div>
              ) : null}
              <button className="secondary-button" type="submit" disabled={isUpdating || Boolean(shouldGuideToMemberCreation)}>
                {shouldGuideToMemberCreation ? "아래에서 멤버로 등록" : "상태 저장"}
              </button>
            </form>

            <form
              action={convertAction}
              className={`new-family-side-form new-family-conversion-form ${shouldGuideToMemberCreation ? "is-suggested" : ""}`}
              key={`convert-${selectedApplicant.id}-${defaultConvertGroupId}`}
            >
              <input name="id" type="hidden" value={selectedApplicant.id} />
              <div className="conversion-preview">
                <strong>멤버 로스터 등록</strong>
                <span>
                  이름, 이메일, 연락처, 주소, 세례/등록, 예정 순 정보가 가능한 만큼 자동 기입됩니다.
                </span>
              </div>
              <label>
                등록할 순
                <select name="groupId" defaultValue={defaultConvertGroupId}>
                  <option value="">미배정</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button" type="submit" disabled={isConverting || Boolean(selectedApplicant.convertedMemberId)}>
                {selectedApplicant.convertedMemberId ? "등록 완료" : "멤버로 등록"}
              </button>
            </form>

            {Object.entries(selectedApplicant.sourceData).filter(([, value]) => String(value ?? "").trim()).length > 0 ? (
              <details className="new-family-raw">
                <summary>원본 응답 보기</summary>
                <dl>
                  {Object.entries(selectedApplicant.sourceData)
                    .filter(([, value]) => String(value ?? "").trim())
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                </dl>
              </details>
            ) : null}
          </section>
        </div>
      ) : null}
      <ActionMessage state={updateState} />
      <ActionMessage state={convertState} />
    </>
  );
}

function NewFamilyBreakdownCard({
  title,
  items,
  total,
}: {
  title: string;
  items: { label: string; count: number }[];
  total: number;
}) {
  return (
    <article className="panel new-family-breakdown-card">
      <div className="mini-roster-heading">
        <strong>{title}</strong>
        <span>{items.reduce((sum, item) => sum + item.count, 0)}명</span>
      </div>
      <div className="new-family-breakdown-list">
        {items.length > 0 ? (
          items.map((item) => {
            const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div className="new-family-breakdown-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <small>{percentage}%</small>
              </div>
            );
          })
        ) : (
          <span className="empty-mini-roster">표시할 데이터 없음</span>
        )}
      </div>
    </article>
  );
}

const feedbackCategoryLabels: Record<AdminFeedbackMessage["category"], string> = {
  feature: "기능 제안",
  bug: "버그 제보",
  question: "문의",
  other: "기타",
};

const feedbackStatusLabels: Record<AdminFeedbackMessage["status"], string> = {
  open: "접수",
  reviewing: "검토 중",
  resolved: "완료",
  closed: "보류",
};

export function FeedbackPageContent({ user, adminFeedbackMessages = [] }: AppDataProps) {
  const canManageFeedback = hasPermission(user.role, "roles:manage");
  const [createFeedbackState, createFeedbackAction, isCreatingFeedback] = useActionState(
    createAdminFeedbackMessage,
    initialActionState,
  );
  const [updateFeedbackState, updateFeedbackAction, isUpdatingFeedback] = useActionState(
    updateAdminFeedbackMessage,
    initialActionState,
  );
  const openCount = adminFeedbackMessages.filter((message) => message.status === "open").length;
  const reviewingCount = adminFeedbackMessages.filter((message) => message.status === "reviewing").length;

  return (
    <>
      <PageHeader eyebrow="운영 피드백" title="피드백" user={user}>
        <span className="status-pill">{canManageFeedback ? `${openCount + reviewingCount}건 진행 중` : "관리자에게 전달"}</span>
      </PageHeader>
      <SectionNav
        items={[
          { href: "#feedback-create", label: "메시지 보내기" },
          { href: "#feedback-list", label: canManageFeedback ? "접수함" : "내 요청" },
        ]}
      />

      <section className="feedback-hero panel" id="feedback-create">
        <div>
          <p className="eyebrow">Newavely Inbox</p>
          <h2>기능 제안이나 버그를 관리자에게 알려주세요</h2>
          <p className="meta">짧게 남겨도 괜찮습니다. 운영자가 확인하고 상태를 업데이트합니다.</p>
        </div>
      </section>

      <section className="panel form-panel feedback-compose-panel">
        <form action={createFeedbackAction} className="member-form feedback-form">
          <label>
            종류
            <select name="category" defaultValue="feature">
              <option value="feature">기능 제안</option>
              <option value="bug">버그 제보</option>
              <option value="question">문의</option>
              <option value="other">기타</option>
            </select>
          </label>
          <label>
            제목
            <input name="title" placeholder="예: 출석 화면에서 순 필터가 있으면 좋겠어요" required />
          </label>
          <label className="full-width">
            내용
            <textarea
              name="message"
              placeholder="어떤 상황에서 필요하거나 문제가 생겼는지 적어주세요."
              required
              rows={4}
            />
          </label>
          <div className="form-actions full-width">
            <button className="primary-button" type="submit" disabled={isCreatingFeedback}>
              {isCreatingFeedback ? "보내는 중" : "관리자에게 보내기"}
            </button>
          </div>
        </form>
        <ActionMessage state={createFeedbackState} />
      </section>

      <section className="panel feedback-inbox-panel" id="feedback-list">
        <div className="panel-heading">
          <div>
            <h2>{canManageFeedback ? "피드백 접수함" : "내가 보낸 메시지"}</h2>
            <p className="meta">
              {canManageFeedback ? "관리자가 접수된 제안과 문제를 확인하고 처리 상태를 남깁니다." : "내가 보낸 요청의 처리 상태를 확인할 수 있습니다."}
            </p>
          </div>
          <span className="status-pill">{adminFeedbackMessages.length}건</span>
        </div>

        <div className="feedback-list">
          {adminFeedbackMessages.map((message) => (
            <article className="feedback-item" key={message.id}>
              <div className="feedback-item-main">
                <div className="feedback-item-kicker">
                  <span className={`feedback-category ${message.category}`}>{feedbackCategoryLabels[message.category]}</span>
                  <span className={`feedback-status ${message.status}`}>{feedbackStatusLabels[message.status]}</span>
                </div>
                <h3>{message.title}</h3>
                <p>{message.message}</p>
                <span className="meta">
                  {message.reporterName} · {message.reporterGroupName} · {formatStatusUpdatedAt(message.createdAt)}
                </span>
                {message.adminNote ? <p className="feedback-admin-note">관리자 메모: {message.adminNote}</p> : null}
              </div>
              {canManageFeedback ? (
                <form action={updateFeedbackAction} className="feedback-admin-form">
                  <input name="id" type="hidden" value={message.id} />
                  <label>
                    상태
                    <select name="status" defaultValue={message.status}>
                      <option value="open">접수</option>
                      <option value="reviewing">검토 중</option>
                      <option value="resolved">완료</option>
                      <option value="closed">보류</option>
                    </select>
                  </label>
                  <label>
                    관리자 메모
                    <input name="adminNote" placeholder="처리 메모" defaultValue={message.adminNote} />
                  </label>
                  <button className="secondary-button" type="submit" disabled={isUpdatingFeedback}>
                    업데이트
                  </button>
                </form>
              ) : null}
            </article>
          ))}
          {adminFeedbackMessages.length === 0 ? (
            <article className="empty-state">
              <strong>{canManageFeedback ? "접수된 피드백이 없습니다" : "아직 보낸 메시지가 없습니다"}</strong>
              <span>필요한 기능이나 불편한 점이 생기면 위에서 바로 남겨주세요.</span>
            </article>
          ) : null}
        </div>
        <ActionMessage state={updateFeedbackState} />
      </section>
    </>
  );
}

export function AttendanceManager({
  user,
  attendanceDate,
  attendanceTitle,
  attendanceEventId,
  attendanceEvents,
  attendanceExtraCounts = [],
  members,
  groups,
  globalStats,
}: AppDataProps & {
  attendanceDate: string;
  attendanceTitle: string;
  attendanceEventId?: string;
  attendanceEvents: AttendanceEvent[];
}) {
  const searchParams = useSearchParams();
  const explicitAttendanceEventId = searchParams.get("eventId");
  const requestedAttendanceGroupId = searchParams.get("groupId");
  const attendanceVisibleGroups = getAttendanceVisibleGroups(groups);
  const attendanceVisibleGroupIds = new Set(attendanceVisibleGroups.map((group) => group.id));
  const communityLeaderGroup = groups.find((group) => group.name.includes("공동체 리더")) ?? null;
  const initialCurrentAttendanceMember = members.find((member) => member.authUserId === user.id) ?? members.find((member) => member.email === user.email);
  const manageableAttendanceGroups =
    user.role === "staff"
      ? attendanceVisibleGroups.filter(
          (group) => group.leaderMemberId === initialCurrentAttendanceMember?.id || group.id === initialCurrentAttendanceMember?.groupId,
        )
      : user.role === "assistant"
        ? attendanceVisibleGroups.filter((group) => initialCurrentAttendanceMember?.groupId && group.id === initialCurrentAttendanceMember.groupId)
        : attendanceVisibleGroups;
  const manageableAttendanceGroupIds = new Set(manageableAttendanceGroups.map((group) => group.id));
  const shouldScopeAttendanceGroups = user.role === "staff" || user.role === "assistant";
  const initialAttendanceGroupId =
    requestedAttendanceGroupId && manageableAttendanceGroups.some((group) => group.id === requestedAttendanceGroupId)
      ? requestedAttendanceGroupId
      : requestedAttendanceGroupId === "unassigned" && !shouldScopeAttendanceGroups
        ? "unassigned"
        : shouldScopeAttendanceGroups && manageableAttendanceGroups[0]
          ? manageableAttendanceGroups[0].id
        : "all";
  const [localMembers, setLocalMembers] = useState(members);
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
  const [createEventState, createEventAction, isCreatingEvent] = useActionState(createAttendanceEvent, initialActionState);
  const [deleteEventState, deleteEventAction, isDeletingEvent] = useActionState(deleteAttendanceEvent, initialActionState);
  const [extraCountState, extraCountAction, isSavingExtraCounts] = useActionState(updateAttendanceExtraCounts, initialActionState);
  const [isPending, startTransition] = useTransition();
  const canManageAttendance = hasPermission(user.role, "attendance:write");
  const canReadAttendanceTotals = hasPermission(user.role, "attendance:read");
  const canManageAttendanceExtraCounts = hasPermission(user.role, "attendance:extras:write");
  const isWelcomeAttendanceOnly = user.role === "welcome";
  const canDeleteAttendanceEvents = canUseDeleteActions(user.role);
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState("");
  const [attendanceGroupId, setAttendanceGroupId] = useState(initialAttendanceGroupId);
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [statsEventTypeFilter, setStatsEventTypeFilter] = useState("all");
  const [statsDateFilter, setStatsDateFilter] = useState("all");
  const [statsGroupId, setStatsGroupId] = useState("all");
  const [absenceMinimumStreak, setAbsenceMinimumStreak] = useState(3);
  const [eventPendingDelete, setEventPendingDelete] = useState<AttendanceEvent | null>(null);
  const [attendanceMemberModal, setAttendanceMemberModal] = useState<{ memberId: string; mode: "menu" | "reason" } | null>(null);
  const [readAttendanceEventIds, setReadAttendanceEventIds] = useState<Set<string>>(new Set());
  const readEventsStorageKey = `newavely:read-attendance-events:${user.id}`;
  const hasExplicitAttendanceSelection = Boolean(explicitAttendanceEventId);
  const buildAttendanceHref = (eventId: string, hash = "") => {
    const params = new URLSearchParams({ eventId });
    if (!isWelcomeAttendanceOnly && attendanceGroupId !== "all") {
      params.set("groupId", attendanceGroupId);
      params.set("mode", "group");
    }
    return `/attendance?${params.toString()}${hash}`;
  };

  useEffect(() => {
    setLocalMembers(members);
  }, [attendanceEventId, members]);

  useEffect(() => {
    if (deleteEventState.ok) {
      setEventPendingDelete(null);
      window.location.href = "/attendance";
    }
  }, [deleteEventState.ok]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(readEventsStorageKey);
      if (!stored) {
        const initialReadIds = attendanceEvents.map((event) => event.id);
        window.localStorage.setItem(readEventsStorageKey, JSON.stringify(initialReadIds));
        setReadAttendanceEventIds(new Set(initialReadIds));
        return;
      }
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setReadAttendanceEventIds(new Set(parsed.filter((id): id is string => typeof id === "string")));
      }
    } catch {
      setReadAttendanceEventIds(new Set(attendanceEvents.map((event) => event.id)));
    }
  }, [attendanceEvents, readEventsStorageKey]);

  useEffect(() => {
    if (!explicitAttendanceEventId) return;
    const selectedEvent = attendanceEvents.find((event) => event.id === explicitAttendanceEventId);
    const readEventIds = selectedEvent
      ? attendanceEvents.filter((event) => event.eventDate === selectedEvent.eventDate).map((event) => event.id)
      : [explicitAttendanceEventId];
    setReadAttendanceEventIds((current) => {
      const next = new Set(current);
      for (const eventId of readEventIds) next.add(eventId);
      if (next.size === current.size) return current;
      try {
        window.localStorage.setItem(readEventsStorageKey, JSON.stringify([...next]));
      } catch {
        // Ignore storage write failures; the visual cue can reappear next session.
      }
      return next;
    });
  }, [attendanceEvents, explicitAttendanceEventId, readEventsStorageKey]);

  const attendanceEventTypes = useMemo(() => {
    const preferredOrder = ["주일 예배", "순모임"];
    const titles = [...new Set(attendanceEvents.map((event) => event.title))];
    return titles.sort((a, b) => {
      const preferredA = preferredOrder.indexOf(a);
      const preferredB = preferredOrder.indexOf(b);
      if (preferredA !== -1 || preferredB !== -1) {
        return (preferredA === -1 ? 99 : preferredA) - (preferredB === -1 ? 99 : preferredB);
      }
      return a.localeCompare(b);
    });
  }, [attendanceEvents]);
  const sameDateEvents = attendanceEvents
    .filter((event) => event.eventDate === attendanceDate)
    .sort((a, b) => attendanceEventTypes.indexOf(a.title) - attendanceEventTypes.indexOf(b.title));
  const eventDateOptions = [...new Set(attendanceEvents.map((event) => event.eventDate))].sort((a, b) => b.localeCompare(a));
  const filteredEventDateOptions = eventDateOptions.filter((eventDate) => {
    const normalizedQuery = eventSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return true;
    const dateEvents = attendanceEvents.filter((event) => event.eventDate === eventDate);
    return [eventDate, ...dateEvents.map((event) => event.title)].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const selectedAttendanceEvent = attendanceEvents.find((event) => event.id === attendanceEventId) ?? null;
  const unreadAttendanceEventIds = new Set(attendanceEvents.filter((event) => !readAttendanceEventIds.has(event.id)).map((event) => event.id));
  const currentAttendanceMember = localMembers.find((member) => member.authUserId === user.id) ?? localMembers.find((member) => member.email === user.email);
  const attendanceStats = user.role === "member" ? undefined : globalStats?.attendance;

  const activeMembers = localMembers
    .filter(isAttendanceRosterMember)
    .filter((member) => !member.groupId || attendanceVisibleGroupIds.has(member.groupId))
    .filter((member) => !shouldScopeAttendanceGroups || Boolean(member.groupId && manageableAttendanceGroupIds.has(member.groupId)))
    .filter((member) => user.role !== "member" || member.id === currentAttendanceMember?.id);
  const activeMemberCount = activeMembers.length;
  const currentPresentCount = activeMembers.filter((member) => member.present).length;
  const currentExcusedCount = activeMembers.filter((member) => getMemberAttendanceStatus(member, attendanceEventId) === "excused").length;
  const currentAbsentCount = Math.max(activeMemberCount - currentPresentCount - currentExcusedCount, 0);
  const currentAttendanceRate = activeMemberCount ? Math.round((currentPresentCount / activeMemberCount) * 100) : 0;
  const groupAttendanceStats = attendanceVisibleGroups.map((group) => {
    const groupMembers = activeMembers.filter((member) => member.groupId === group.id);
    const presentCount = groupMembers.filter((member) => member.present).length;
    return {
      id: group.id,
      name: group.name,
      presentCount,
      totalCount: groupMembers.length,
      rate: groupMembers.length ? Math.round((presentCount / groupMembers.length) * 100) : 0,
    };
  });
  const unassignedMembers = activeMembers.filter((member) => !member.groupId);
  const unassignedPresentCount = unassignedMembers.filter((member) => member.present).length;
  const unassignedAttendanceRate = unassignedMembers.length
    ? Math.round((unassignedPresentCount / unassignedMembers.length) * 100)
    : 0;
  const eventTrend = attendanceEvents.map((event) => {
    const presentCount =
      event.id === attendanceEventId
        ? currentPresentCount
        : activeMembers.filter((member) =>
            member.attendanceHistory.some((record) => record.eventId === event.id && record.status === "present"),
          ).length;
    const rate = activeMemberCount ? Math.round((presentCount / activeMemberCount) * 100) : 0;
    return { ...event, presentCount, rate };
  });
  const aggregateStatsEvents = attendanceEvents.filter(
    (event) =>
      (statsEventTypeFilter === "all" || event.title === statsEventTypeFilter) &&
      (statsDateFilter === "all" || event.eventDate === statsDateFilter),
  );
  const aggregateEventIds = new Set(aggregateStatsEvents.map((event) => event.id));
  const aggregateGroupStats = [
    ...attendanceVisibleGroups.map((group) => {
      const groupMembers = activeMembers.filter((member) => member.groupId === group.id);
      return buildAggregateAttendanceStat(
        statsEventTypeFilter,
        group.id,
        group.name,
        groupMembers,
        aggregateEventIds,
        aggregateStatsEvents.length,
      );
    }),
    buildAggregateAttendanceStat(
      statsEventTypeFilter,
      "unassigned",
      "미배정",
      activeMembers.filter((member) => !member.groupId),
      aggregateEventIds,
      aggregateStatsEvents.length,
    ),
  ].filter((group) => group.memberCount > 0 && (statsGroupId === "all" || group.id === statsGroupId));
  const aggregateTotals = aggregateGroupStats.reduce(
    (totals, group) => ({
      memberCount: totals.memberCount + group.memberCount,
      possibleCount: totals.possibleCount + group.possibleCount,
      presentCount: totals.presentCount + group.presentCount,
      excusedCount: totals.excusedCount + group.excusedCount,
    }),
    { memberCount: 0, possibleCount: 0, presentCount: 0, excusedCount: 0 },
  );
  const aggregateRate = aggregateTotals.possibleCount
    ? Math.round((aggregateTotals.presentCount / aggregateTotals.possibleCount) * 100)
    : 0;
  const aggregateAbsentCount = Math.max(aggregateTotals.possibleCount - aggregateTotals.presentCount - aggregateTotals.excusedCount, 0);
  const displayActiveMemberCount = attendanceStats?.activeMemberCount ?? activeMemberCount;
  const displayCurrentPresentCount = attendanceStats?.currentPresentCount ?? currentPresentCount;
  const displayCurrentExcusedCount = attendanceStats?.currentExcusedCount ?? currentExcusedCount;
  const displayCurrentAbsentCount = attendanceStats?.currentAbsentCount ?? currentAbsentCount;
  const displayCurrentAttendanceRate = attendanceStats?.currentAttendanceRate ?? currentAttendanceRate;
  const displayGroupAttendanceStats = attendanceStats?.groupAttendanceStats ?? groupAttendanceStats;
  const displayUnassignedStats = attendanceStats?.unassigned ?? {
    id: "unassigned",
    name: "미배정",
    presentCount: unassignedPresentCount,
    totalCount: unassignedMembers.length,
    rate: unassignedAttendanceRate,
  };
  const selectedExtraCounts = attendanceExtraCounts.find((row) => row.eventDate === attendanceDate);
  const attendanceExtraValues = {
    visitorCount: selectedExtraCounts?.visitorCount ?? 0,
    newFamilyCount: selectedExtraCounts?.newFamilyCount ?? 0,
  };
  const worshipEventForDate = sameDateEvents.find((event) => event.title === "주일 예배") ?? null;
  const communityLeaderMembers = localMembers
    .filter(isAttendanceRosterMember)
    .map((member) => ({ member, leaderRole: getCommunityLeaderRole(member) }))
    .filter(({ member, leaderRole }) => leaderRole || (communityLeaderGroup && member.groupId === communityLeaderGroup.id))
    .sort((a, b) => {
      const roleOrder: Record<CommunityLeaderRole | "", number> = { clergy: 0, team_leader: 1, elder: 2, deaconess: 3, "": 4 };
      return roleOrder[a.leaderRole] - roleOrder[b.leaderRole] || a.member.name.localeCompare(b.member.name);
    });
  const clergyAttendanceCount = communityLeaderMembers.filter(
    ({ member, leaderRole }) => leaderRole === "clergy" && getMemberAttendanceStatus(member, worshipEventForDate?.id) === "present",
  ).length;
  const teamLeaderPlusAttendanceCount = communityLeaderMembers.filter(
    ({ member, leaderRole }) => isTeamLeaderPlusRole(leaderRole) && getMemberAttendanceStatus(member, worshipEventForDate?.id) === "present",
  ).length;
  const worshipEventIdsForDate = sameDateEvents.filter((event) => event.title === "주일 예배").map((event) => event.id);
  const groupMeetingEventIdsForDate = sameDateEvents.filter((event) => event.title === "순모임").map((event) => event.id);
  const combinedAttendanceEventIdsForDate = [...worshipEventIdsForDate, ...groupMeetingEventIdsForDate];
  const combinedGroupTotalRows =
    combinedAttendanceEventIdsForDate.length > 0
      ? [
          ...attendanceVisibleGroups.map((group) => {
            const groupMembers = activeMembers.filter((member) => member.groupId === group.id);
            const presentCount = groupMembers.filter((member) => isPresentForAnyEvent(member, combinedAttendanceEventIdsForDate)).length;
            const worshipPresentCount = groupMembers.filter((member) => isPresentForAnyEvent(member, worshipEventIdsForDate)).length;
            const groupMeetingPresentCount = groupMembers.filter((member) => isPresentForAnyEvent(member, groupMeetingEventIdsForDate)).length;
            return {
              id: group.id,
              name: group.name,
              presentCount,
              worshipPresentCount,
              groupMeetingPresentCount,
              totalCount: groupMembers.length,
              rate: groupMembers.length ? Math.round((presentCount / groupMembers.length) * 100) : 0,
            };
          }),
          (() => {
            const presentCount = unassignedMembers.filter((member) => isPresentForAnyEvent(member, combinedAttendanceEventIdsForDate)).length;
            const worshipPresentCount = unassignedMembers.filter((member) => isPresentForAnyEvent(member, worshipEventIdsForDate)).length;
            const groupMeetingPresentCount = unassignedMembers.filter((member) => isPresentForAnyEvent(member, groupMeetingEventIdsForDate)).length;
            return {
              id: "unassigned",
              name: "미배정",
              presentCount,
              worshipPresentCount,
              groupMeetingPresentCount,
              totalCount: unassignedMembers.length,
              rate: unassignedMembers.length ? Math.round((presentCount / unassignedMembers.length) * 100) : 0,
            };
          })(),
        ]
      : [];
  const attendanceGroupTotalRows = (combinedGroupTotalRows.length > 0 ? combinedGroupTotalRows : displayGroupAttendanceStats)
    .filter((group) => group.totalCount > 0)
    .map((group) => ({
      ...group,
      worshipPresentCount: "worshipPresentCount" in group && typeof group.worshipPresentCount === "number" ? group.worshipPresentCount : group.presentCount,
      groupMeetingPresentCount:
        "groupMeetingPresentCount" in group && typeof group.groupMeetingPresentCount === "number" ? group.groupMeetingPresentCount : 0,
    }));
  const youthAttendanceTotal = attendanceGroupTotalRows.reduce((total, group) => total + group.presentCount, 0);
  const youthWorshipAttendanceTotal = attendanceGroupTotalRows.reduce((total, group) => total + group.worshipPresentCount, 0);
  const youthGroupMeetingAttendanceTotal = attendanceGroupTotalRows.reduce((total, group) => total + group.groupMeetingPresentCount, 0);
  const externalAttendanceTotal =
    clergyAttendanceCount +
    teamLeaderPlusAttendanceCount +
    attendanceExtraValues.visitorCount +
    attendanceExtraValues.newFamilyCount;
  const totalAttendanceWithExtras = youthAttendanceTotal + externalAttendanceTotal;
  const totalWorshipAttendanceWithExtras = youthWorshipAttendanceTotal + externalAttendanceTotal;
  const displayEventTrend = attendanceStats?.eventTrend ?? eventTrend;
  const aggregateStatsFromTrend = Object.values(
    (attendanceStats?.eventGroupTrend ?? []).reduce<
      Record<string, { eventType: string; id: string; name: string; memberCount: number; possibleCount: number; presentCount: number; excusedCount: number }>
    >((rows, row) => {
      if (statsEventTypeFilter !== "all" && row.eventType !== statsEventTypeFilter) return rows;
      if (statsDateFilter !== "all" && row.eventDate !== statsDateFilter) return rows;
      const current = rows[row.groupId] ?? {
        eventType: statsEventTypeFilter,
        id: row.groupId,
        name: row.groupName,
        memberCount: row.totalCount,
        possibleCount: 0,
        presentCount: 0,
        excusedCount: 0,
      };
      rows[row.groupId] = {
        ...current,
        memberCount: Math.max(current.memberCount, row.totalCount),
        possibleCount: current.possibleCount + row.totalCount,
        presentCount: current.presentCount + row.presentCount,
        excusedCount: current.excusedCount + row.excusedCount,
      };
      return rows;
    }, {}),
  ).map((group) => ({
    ...group,
    rate: group.possibleCount ? Math.round((group.presentCount / group.possibleCount) * 100) : 0,
  }));
  const displayAggregateGroupStats = (attendanceStats?.eventGroupTrend ? aggregateStatsFromTrend : aggregateGroupStats).filter(
    (group) => group.memberCount > 0 && (statsGroupId === "all" || group.id === statsGroupId),
  );
  const displayAggregateTotals = displayAggregateGroupStats.reduce(
    (totals, group) => ({
      memberCount: totals.memberCount + group.memberCount,
      possibleCount: totals.possibleCount + group.possibleCount,
      presentCount: totals.presentCount + group.presentCount,
      excusedCount: totals.excusedCount + group.excusedCount,
    }),
    { memberCount: 0, possibleCount: 0, presentCount: 0, excusedCount: 0 },
  );
  const displayAggregateRate = displayAggregateTotals.possibleCount
    ? Math.round((displayAggregateTotals.presentCount / displayAggregateTotals.possibleCount) * 100)
    : 0;
  const displayAggregateAbsentCount = Math.max(
    displayAggregateTotals.possibleCount - displayAggregateTotals.presentCount - displayAggregateTotals.excusedCount,
    0,
  );
  const trendSource = attendanceStats?.eventGroupTrend ?? [];
  const filteredTrendRows = trendSource
    .filter((row) => statsEventTypeFilter === "all" || row.eventType === statsEventTypeFilter)
    .filter((row) => statsDateFilter === "all" || row.eventDate === statsDateFilter)
    .filter((row) => statsGroupId === "all" || row.groupId === statsGroupId)
    .slice(0, 48);
  const compactTrendRows = Object.values(
    filteredTrendRows.reduce<Record<string, { eventDate: string; eventType: string; rateSum: number; presentCount: number; totalCount: number; rowCount: number }>>(
      (rows, row) => {
        const key = `${row.eventDate}-${row.eventType}`;
        const current = rows[key] ?? {
          eventDate: row.eventDate,
          eventType: row.eventType,
          rateSum: 0,
          presentCount: 0,
          totalCount: 0,
          rowCount: 0,
        };
        rows[key] = {
          ...current,
          rateSum: current.rateSum + row.rate,
          presentCount: current.presentCount + row.presentCount,
          totalCount: current.totalCount + row.totalCount,
          rowCount: current.rowCount + 1,
        };
        return rows;
      },
      {},
    ),
  )
    .map((row) => ({
      ...row,
      rate: row.rowCount ? Math.round(row.rateSum / row.rowCount) : 0,
    }))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
    .slice(0, 10);
  const comparisonRows = [...displayAggregateGroupStats].sort((a, b) => b.rate - a.rate).slice(0, 8);
  const absenceUnits = buildAttendanceAbsenceUnits(attendanceEvents, statsEventTypeFilter, statsDateFilter).slice(0, 10);
  const absenceWatchList = activeMembers
    .map((member) => {
      let streak = 0;
      for (const unit of absenceUnits) {
        const status = getMemberAttendanceStatusForAnyEvent(member, unit.eventIds);
        if (status === "present" || status === "excused") break;
        streak += 1;
      }
      return { member, streak };
    })
    .filter((item) => statsGroupId === "all" || item.member.groupId === statsGroupId || (!item.member.groupId && statsGroupId === "unassigned"))
    .filter((item) => item.streak >= absenceMinimumStreak)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 8);

  const attendanceMembers = activeMembers.filter((member) => {
    const status = getMemberAttendanceStatus(member, attendanceEventId);
    const normalizedQuery = attendanceSearchQuery.trim().toLowerCase();
    const matchesQuery = normalizedQuery
      ? [member.displayName, member.groupName].some((value) => value.toLowerCase().includes(normalizedQuery))
      : true;
    const matchesGroup =
      attendanceGroupId === "all" ||
      (attendanceGroupId === "unassigned" ? !member.groupId : member.groupId === attendanceGroupId);
    if (attendanceFilter === "present") return matchesQuery && matchesGroup && status === "present";
    if (attendanceFilter === "absent") return matchesQuery && matchesGroup && status === "absent";
    if (attendanceFilter === "excused") return matchesQuery && matchesGroup && status === "excused";
    return matchesQuery && matchesGroup;
  });
  const attendanceOverviewMembers = activeMembers.filter((member) => {
    const normalizedQuery = attendanceSearchQuery.trim().toLowerCase();
    const matchesQuery = normalizedQuery
      ? [member.displayName, member.groupName].some((value) => value.toLowerCase().includes(normalizedQuery))
      : true;
    const matchesGroup =
      attendanceGroupId === "all" ||
      (attendanceGroupId === "unassigned" ? !member.groupId : member.groupId === attendanceGroupId);
    return matchesQuery && matchesGroup;
  });
  const overviewGroupName =
    attendanceGroupId === "all"
      ? "전체 순"
      : attendanceGroupId === "unassigned"
        ? "미배정"
        : attendanceVisibleGroups.find((group) => group.id === attendanceGroupId)?.name ?? "미배정";
  const attendanceGroupOptions = [
    ...(shouldScopeAttendanceGroups ? [] : [{ id: "all", name: "전체" }]),
    ...(isWelcomeAttendanceOnly
      ? []
      : user.role === "member"
        ? attendanceVisibleGroups
            .filter((group) => currentAttendanceMember?.groupId && group.id === currentAttendanceMember.groupId)
            .map((group) => ({ id: group.id, name: group.name }))
        : manageableAttendanceGroups.map((group) => ({ id: group.id, name: group.name }))),
    ...(isWelcomeAttendanceOnly || shouldScopeAttendanceGroups || (user.role === "member" && currentAttendanceMember?.groupId)
      ? []
      : [{ id: "unassigned", name: "미배정" }]),
  ];
  const attendanceOverviewEvents = getAttendanceOverviewEvents(sameDateEvents, selectedAttendanceEvent?.id);
  const attendanceOverviewStats = attendanceOverviewEvents.map((event) => {
    const presentCount = attendanceOverviewMembers.filter((member) => getMemberAttendanceStatus(member, event.id) === "present").length;
    const excusedCount = attendanceOverviewMembers.filter((member) => getMemberAttendanceStatus(member, event.id) === "excused").length;
    const absentCount = Math.max(attendanceOverviewMembers.length - presentCount - excusedCount, 0);
    return { event, presentCount, excusedCount, absentCount };
  });
  const attendanceCheckEventNames = [...new Set(sameDateEvents.map((event) => event.title))].join(" · ");
  const attendanceOverviewRows = attendanceOverviewMembers.map((member) => {
    const statuses = attendanceOverviewEvents.map((event) => ({
      event,
      status: getMemberAttendanceStatus(member, event.id),
    }));
    const missedCount = statuses.filter((item) => item.status === "absent").length;
    const presentCount = statuses.filter((item) => item.status === "present").length;
    return { member, missedCount, presentCount, statuses };
  });
  const fullyPresentCount = attendanceOverviewRows.filter(
    (row) => row.statuses.length > 0 && row.statuses.every((item) => item.status === "present"),
  ).length;
  const needsCheckCount = attendanceOverviewRows.filter((row) => row.statuses.some((item) => item.status === "absent")).length;
  const selectedAttendanceModalMember = attendanceMemberModal
    ? activeMembers.find((member) => member.id === attendanceMemberModal.memberId) ?? null
    : null;
  const handleToggleAttendanceEvent = (member: Member, event: AttendanceEvent, nextPresent: boolean) => {
    setLocalMembers((current) =>
      current.map((item) =>
        item.id === member.id
          ? {
              ...item,
              present: event.id === attendanceEventId ? nextPresent : item.present,
              attendanceHistory: updateLocalAttendanceHistory({
                attendanceDate: event.eventDate,
                attendanceTitle: event.title,
                eventId: event.id,
                history: item.attendanceHistory,
                nextPresent,
              }),
            }
          : item,
      ),
    );
    startTransition(() => {
      void toggleAttendance(member.id, event.id, nextPresent);
    });
  };
  const handleToggleLeaderExtraAttendance = (member: Member, nextPresent: boolean) => {
    if (!worshipEventForDate) return;
    setLocalMembers((current) =>
      current.map((item) =>
        item.id === member.id
          ? {
              ...item,
              present: worshipEventForDate.id === attendanceEventId ? nextPresent : item.present,
              attendanceHistory: updateLocalAttendanceHistory({
                attendanceDate: worshipEventForDate.eventDate,
                attendanceTitle: worshipEventForDate.title,
                eventId: worshipEventForDate.id,
                history: item.attendanceHistory,
                nextPresent,
              }),
            }
          : item,
      ),
    );
    startTransition(() => {
      void toggleLeaderExtraAttendance(member.id, worshipEventForDate.id, nextPresent);
    });
  };

  return (
    <>
      <PageHeader eyebrow="출석 관리" title="출석" user={user} />
      <SectionNav
        items={[
          { href: "#attendance-stats", label: "통계" },
          { href: "#attendance-create", label: "새 이벤트" },
          { href: "#attendance-checklist", label: "출석 체크" },
        ]}
      />
      <div className="attendance-page-flow">
      {eventPendingDelete ? (
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={() => setEventPendingDelete(null)}
        >
          <div
            aria-labelledby="attendance-event-delete-title"
            aria-modal="true"
            className="confirm-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-copy">
              <span className="status-pill inactive">삭제 확인</span>
              <h2 id="attendance-event-delete-title">이 날짜의 출석 이벤트를 지울까요?</h2>
              <p>
                <strong>{eventPendingDelete.eventDate}</strong> 날짜의 주일 예배와 순모임 이벤트를 함께 삭제합니다. 연결된
                멤버별 출석 기록도 같이 정리됩니다.
              </p>
            </div>
            <div className="confirm-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setEventPendingDelete(null)}>
                취소
              </button>
              <form action={deleteEventAction}>
                <input name="id" type="hidden" value={eventPendingDelete.id} />
                <button
                  className="danger-button"
                  type="submit"
                  disabled={!canManageAttendance || !canDeleteAttendanceEvents || isDeletingEvent}
                >
                  삭제
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      {selectedAttendanceModalMember && attendanceMemberModal?.mode === "menu" ? (
        <AttendanceMemberActionModal
          attendanceEvents={attendanceOverviewEvents}
          member={selectedAttendanceModalMember}
          onClose={() => setAttendanceMemberModal(null)}
          onOpenReason={() => setAttendanceMemberModal({ memberId: selectedAttendanceModalMember.id, mode: "reason" })}
        />
      ) : null}
      {selectedAttendanceModalMember && attendanceMemberModal?.mode === "reason" ? (
        <AttendanceReasonModal
          attendanceDate={attendanceDate}
          attendanceEvents={attendanceOverviewEvents}
          canManageAttendance={canManageAttendance}
          member={selectedAttendanceModalMember}
          onBack={() => setAttendanceMemberModal({ memberId: selectedAttendanceModalMember.id, mode: "menu" })}
          onClose={() => setAttendanceMemberModal(null)}
        />
      ) : null}

      {canReadAttendanceTotals ? (
        <section className="attendance-total-panel pinned-attendance-total" aria-label="예배 총 출석 집계">
          <div className="attendance-total-heading">
            <div>
              <span className="eyebrow">예배 총 출석 집계</span>
              <h2>{attendanceDate}</h2>
              <p>순별 예배 또는 순모임 출석에 교역자/팀장 이상/방문자/새가족을 더해 총 출석을 계산합니다.</p>
            </div>
          </div>
          <div className="attendance-total-hero-grid">
            <article className="attendance-total-hero-card primary">
              <span>예배 총 출석</span>
              <strong>{totalAttendanceWithExtras}</strong>
              <small>청년 하나 이상 출석 + 교역자/팀장 이상 + 방문자 + 새가족</small>
              <div className="attendance-total-substats" aria-label="예배 총 출석 세부 수치">
                <span>예배 {totalWorshipAttendanceWithExtras}</span>
                <span>순모임 {youthGroupMeetingAttendanceTotal}</span>
              </div>
            </article>
            <article className="attendance-total-hero-card">
              <span>청년 출석</span>
              <strong>{youthAttendanceTotal}</strong>
              <small>예배 또는 순모임 중 하나 이상 출석</small>
              <div className="attendance-total-substats" aria-label="청년 출석 세부 수치">
                <span>예배 {youthWorshipAttendanceTotal}</span>
                <span>순모임 {youthGroupMeetingAttendanceTotal}</span>
              </div>
            </article>
          </div>
          <div className="attendance-total-breakdown" aria-label="예배 총 출석 세부 집계">
            <article>
              <span>교역자</span>
              <strong>{clergyAttendanceCount}</strong>
            </article>
            <article>
              <span>팀장 이상</span>
              <strong>{teamLeaderPlusAttendanceCount}</strong>
            </article>
            <article>
              <span>방문자</span>
              <strong>{attendanceExtraValues.visitorCount}</strong>
            </article>
            <article>
              <span>새가족</span>
              <strong>{attendanceExtraValues.newFamilyCount}</strong>
            </article>
          </div>
          <div className="attendance-total-grid" aria-label="순별 주일 예배 출석 수">
            {attendanceGroupTotalRows.map((group) => (
              <div className="attendance-total-chip" key={group.id}>
                <span>{group.name}</span>
                <strong>{group.presentCount}</strong>
                <small>
                  예배 {group.worshipPresentCount} · 순모임 {group.groupMeetingPresentCount}
                </small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <DisclosurePanel
        id="attendance-stats"
        title="상세 출석 통계"
        meta={`${hasExplicitAttendanceSelection ? attendanceTitle : "최근 이벤트 기준"} · 펼쳐서 보기`}
      >
        <section className="attendance-insight-panel" aria-label="상호작용 출석 통계">
          <div className="attendance-stats-toolbar">
            <label>
              이벤트 종류
              <select value={statsEventTypeFilter} onChange={(event) => setStatsEventTypeFilter(event.target.value)}>
                <option value="all">전체 이벤트</option>
                {attendanceEventTypes.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              날짜
              <select value={statsDateFilter} onChange={(event) => setStatsDateFilter(event.target.value)}>
                <option value="all">전체 날짜</option>
                {eventDateOptions.map((eventDate) => (
                  <option key={eventDate} value={eventDate}>
                    {eventDate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              순
              <select value={statsGroupId} onChange={(event) => setStatsGroupId(event.target.value)}>
                <option value="all">전체 순</option>
                {attendanceVisibleGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
                <option value="unassigned">미배정</option>
              </select>
            </label>
            <label>
              연속 결석
              <select value={absenceMinimumStreak} onChange={(event) => setAbsenceMinimumStreak(Number(event.target.value))}>
                <option value={2}>2회 이상</option>
                <option value={3}>3회 이상</option>
                <option value={4}>4회 이상</option>
                <option value={5}>5회 이상</option>
              </select>
            </label>
          </div>

          <div className="attendance-kpi-strip">
            <article>
              <span>출석률</span>
              <strong>{displayAggregateRate}%</strong>
              <small>{displayAggregateTotals.presentCount}/{displayAggregateTotals.possibleCount}회</small>
            </article>
            <article>
              <span>사유 있음</span>
              <strong>{displayAggregateTotals.excusedCount}</strong>
              <small>필터 범위 전체</small>
            </article>
            <article>
              <span>미확인</span>
              <strong>{displayAggregateAbsentCount}</strong>
              <small>출석/사유 없음</small>
            </article>
            <article>
              <span>대상 순</span>
              <strong>{displayAggregateGroupStats.length}</strong>
              <small>{aggregateStatsEvents.length}개 이벤트</small>
            </article>
          </div>

          <div className="attendance-insight-grid">
            <article className="attendance-trend-card">
              <div className="panel-heading compact-heading">
                <div>
                  <h2>날짜별 출석률</h2>
                  <p className="meta">필터에 맞는 주일 예배와 순모임 흐름을 한 그래프에서 봅니다.</p>
                </div>
                <span>{compactTrendRows.length}개</span>
              </div>
              <div className="attendance-trend-chart">
                {compactTrendRows.map((event) => (
                  <div className="attendance-trend-row" key={`${event.eventDate}-${event.eventType}`}>
                    <div className="attendance-trend-label">
                      <strong>{event.eventDate}</strong>
                      <span>{event.eventType}</span>
                    </div>
                    <div className="attendance-trend-track">
                      <span
                        className={event.eventType === "순모임" ? "group-meeting" : "worship"}
                        style={{ width: `${event.rate}%` }}
                      />
                      <div className="attendance-hover-card">
                        <strong>{event.rate}%</strong>
                        <span>{event.presentCount}/{event.totalCount}회 출석</span>
                      </div>
                    </div>
                    <strong>{event.rate}%</strong>
                  </div>
                ))}
                {compactTrendRows.length === 0 ? (
                  <article className="empty-table-state">
                    <strong>표시할 추이가 없습니다</strong>
                    <span>이벤트 종류나 순 필터를 조정해보세요.</span>
                  </article>
                ) : null}
              </div>
            </article>

            <article className="attendance-compare-card">
              <div className="panel-heading compact-heading">
                <h2>순별 비교</h2>
                <span>상위 {comparisonRows.length}개</span>
              </div>
              <div className="attendance-compare-list">
                {comparisonRows.map((group) => (
                  <button className="attendance-compare-row" key={group.id} type="button" onClick={() => setStatsGroupId(group.id)}>
                    <span>{group.name}</span>
                    <div className="progress">
                      <span style={{ width: `${group.rate}%` }} />
                    </div>
                    <strong>{group.rate}%</strong>
                  </button>
                ))}
                {comparisonRows.length === 0 ? (
                  <article className="empty-table-state">
                    <strong>비교할 순이 없습니다</strong>
                    <span>필터 조건을 넓혀보세요.</span>
                  </article>
                ) : null}
              </div>
            </article>
          </div>

          <div className="attendance-bottom-grid single">
          <article className="panel stats-card compact-stat-card">
            <div className="panel-heading">
              <h2>미확인 연속 결석</h2>
              <span>{absenceMinimumStreak}회 이상</span>
            </div>
            <div className="stats-list compact-scroll-list">
              {absenceWatchList.map(({ member, streak }) => {
                const englishName = getMemberEnglishName(member);
                return (
                  <div className="stat-row absence-watch-row" key={member.id}>
                    <div className="person-block">
                      <strong>{member.name}</strong>
                      {englishName ? <span className="english-name">{englishName}</span> : null}
                      <span>{member.groupName}</span>
                    </div>
                    <div className="row-actions absence-watch-actions">
                      <span className="status-pill">{streak}회 연속</span>
                      <Link className="secondary-button table-action" href={`/members/${member.id}`}>
                        팔로업
                      </Link>
                    </div>
                  </div>
                );
              })}
              {absenceWatchList.length === 0 ? (
                <article className="care-item">
                  <div className="person-block">
                    <strong>조건에 맞는 미확인 결석자가 없습니다</strong>
                    <span>순, 이벤트 종류, 연속 횟수 필터를 조정해보세요.</span>
                  </div>
                </article>
              ) : null}
            </div>
          </article>
          </div>
        </section>
      </DisclosurePanel>

      <DisclosurePanel
        id="attendance-create"
        title="새 출석 이벤트"
        meta={canManageAttendance ? "날짜를 선택하면 주일 예배와 순모임이 함께 준비됩니다" : "리더/관리자 권한 필요"}
      >
        <form action={createEventAction} className="member-form compact-form">
          <label>
            날짜
            <input name="eventDate" type="date" required disabled={!canManageAttendance} />
          </label>
          <div className="event-create-note">
            <strong>생성되는 출석</strong>
            <span>선택한 날짜 안에 주일 예배와 순모임 출석 체크가 함께 만들어집니다.</span>
          </div>
          <div className="form-actions full-width">
            <ActionMessage state={createEventState} />
            <button className="primary-button" type="submit" disabled={!canManageAttendance || isCreatingEvent}>
              만들기
            </button>
          </div>
        </form>
      </DisclosurePanel>

      <section className="panel" id="attendance-checklist">
        <div className="attendance-check-header">
          <div>
            <h2>출석 체크</h2>
            <span>
              {hasExplicitAttendanceSelection
                ? `${attendanceDate} · ${attendanceCheckEventNames} · ${attendanceMembers.length}/${activeMemberCount}명 표시`
                : "날짜를 선택하면 주일 예배와 순모임을 함께 체크할 수 있습니다"}
            </span>
          </div>
        </div>
        <div className="attendance-check-toolbar">
          <label>
            날짜
            <select
              value={hasExplicitAttendanceSelection ? attendanceDate : ""}
              onChange={(event) => {
                const selectedDate = event.target.value;
                if (selectedDate) {
                  const eventForDate =
                    attendanceEvents.find((item) => item.eventDate === selectedDate && item.title === "주일 예배") ??
                    attendanceEvents.find((item) => item.eventDate === selectedDate);
                  if (eventForDate) {
                    window.location.href = buildAttendanceHref(eventForDate.id, "#attendance-checklist");
                  }
                }
              }}
            >
              <option value="">체크할 날짜 선택</option>
              {filteredEventDateOptions.map((eventDate) => {
                const dateEvents = attendanceEvents.filter((event) => event.eventDate === eventDate);
                const hasUnread = dateEvents.some((event) => unreadAttendanceEventIds.has(event.id));
                return (
                  <option key={eventDate} value={eventDate}>
                    {hasUnread ? "● " : ""}
                    {eventDate}
                  </option>
                );
              })}
              {filteredEventDateOptions.length === 0 ? <option value="">조건에 맞는 날짜 없음</option> : null}
            </select>
          </label>
          {!isWelcomeAttendanceOnly ? (
            <>
              <label>
                검색
                <input
                  onChange={(event) => setAttendanceSearchQuery(event.target.value)}
                  placeholder="이름 또는 순"
                  type="search"
                  value={attendanceSearchQuery}
                />
              </label>
              <label>
                날짜 검색
                <input
                  type="search"
                  placeholder="예: 2026-05"
                  value={eventSearchQuery}
                  onChange={(event) => setEventSearchQuery(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {!isWelcomeAttendanceOnly && hasExplicitAttendanceSelection && selectedAttendanceEvent ? (
            <button
              className="danger-text-button attendance-event-delete-inline"
              type="button"
              disabled={!canManageAttendance || !canDeleteAttendanceEvents || isDeletingEvent}
              onClick={() => setEventPendingDelete(selectedAttendanceEvent)}
            >
              삭제
            </button>
          ) : null}
        </div>
        {canManageAttendanceExtraCounts ? (
          <section className="welcome-attendance-input-panel" aria-label="웰컴팀 예배 출석 입력">
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">웰컴팀 전용</p>
                <h3>예배 추가 출석</h3>
                <p className="meta">
                  {hasExplicitAttendanceSelection
                    ? `${attendanceDate} 주일 예배 기준으로 체크합니다.`
                    : "날짜를 선택하면 공동체 리더 순 출석과 방문자/새가족 인원을 입력할 수 있습니다."}
                </p>
              </div>
              <span>{hasExplicitAttendanceSelection ? "입력 가능" : "날짜 선택 필요"}</span>
            </div>
            {hasExplicitAttendanceSelection ? (
              <div className="welcome-attendance-stack">
                <div className="leader-extra-checklist">
                  <div className="leader-extra-summary">
                    <span>교역자 {clergyAttendanceCount}명</span>
                    <span>팀장 이상 {teamLeaderPlusAttendanceCount}명</span>
                  </div>
                  {worshipEventForDate ? (
                    communityLeaderMembers.length > 0 ? (
                      <div className="leader-extra-grid">
                        {communityLeaderMembers.map(({ member, leaderRole }) => {
                          const isPresent = getMemberAttendanceStatus(member, worshipEventForDate.id) === "present";
                          const canToggleLeaderAttendance = Boolean(leaderRole);
                          return (
                            <button
                              className={`leader-extra-toggle ${isPresent ? "present" : "absent"} ${canToggleLeaderAttendance ? "" : "needs-role"}`}
                              key={member.id}
                              type="button"
                              disabled={isPending || !canToggleLeaderAttendance}
                              onClick={() => handleToggleLeaderExtraAttendance(member, !isPresent)}
                            >
                              <span className="leader-extra-name">{member.displayName}</span>
                              <span className="leader-extra-role">
                                {leaderRole ? communityLeaderRoleLabels[leaderRole] : "구분 필요"}
                              </span>
                              <strong>{canToggleLeaderAttendance ? (isPresent ? "출석" : "미출석") : "설정 필요"}</strong>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <article className="empty-table-state compact-empty-state">
                        <strong>체크할 공동체 리더가 없습니다</strong>
                        <span>멤버 상세에서 공동체 리더 구분을 교역자/팀장/장로/권사로 지정해주세요.</span>
                      </article>
                    )
                  ) : (
                    <article className="empty-table-state compact-empty-state">
                      <strong>주일 예배 이벤트가 없습니다</strong>
                      <span>이 날짜에 주일 예배 이벤트를 먼저 만들어주세요.</span>
                    </article>
                  )}
                </div>
                <form action={extraCountAction} className="attendance-extra-form visitor-extra-form">
                  <input name="eventDate" type="hidden" value={attendanceDate} />
                  <label>
                    방문자
                    <input
                      name="visitorCount"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={attendanceExtraValues.visitorCount}
                    />
                  </label>
                  <label>
                    새가족
                    <input
                      name="newFamilyCount"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={attendanceExtraValues.newFamilyCount}
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={isSavingExtraCounts}>
                    저장
                  </button>
                  <ActionMessage state={extraCountState} />
                </form>
              </div>
            ) : (
              <article className="empty-table-state attendance-empty-state compact-empty-state">
                <strong>날짜를 먼저 선택해주세요</strong>
                <span>선택한 날짜의 예배 총 출석에 반영됩니다.</span>
              </article>
            )}
          </section>
        ) : null}
        {!isWelcomeAttendanceOnly ? (
          <div className="attendance-check-controls">
            <div className="segmented">
              {(["all", "present", "absent", "excused"] as const).map((filter) => (
                <button
                  className={`segment ${attendanceFilter === filter ? "active" : ""}`}
                  key={filter}
                  onClick={() => setAttendanceFilter(filter)}
                  type="button"
                >
                  {attendanceFilterLabels[filter]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {!isWelcomeAttendanceOnly ? (
          <div className="attendance-group-strip" aria-label="순 선택">
            {attendanceGroupOptions.map((group) => (
              <button
                className={`attendance-group-chip ${attendanceGroupId === group.id ? "active" : ""}`}
                key={group.id}
                onClick={() => setAttendanceGroupId(group.id)}
                type="button"
              >
                {group.name}
              </button>
            ))}
          </div>
        ) : null}
        <ActionMessage state={deleteEventState} />
        {attendanceEvents.length === 0 ? (
          <article className="empty-table-state attendance-empty-state">
            <strong>아직 출석 이벤트가 없습니다</strong>
            <span>새 출석 이벤트를 만들면 멤버별 출석을 체크할 수 있습니다.</span>
          </article>
        ) : null}
        {attendanceEvents.length > 0 && filteredEventDateOptions.length === 0 ? (
          <article className="empty-table-state attendance-empty-state">
            <strong>조건에 맞는 날짜가 없습니다</strong>
            <span>날짜 검색어를 조정해보세요.</span>
          </article>
        ) : null}
        {!isWelcomeAttendanceOnly && !hasExplicitAttendanceSelection && filteredEventDateOptions.length > 0 ? (
          <article className="empty-table-state attendance-empty-state">
            <strong>출석 체크할 날짜를 선택해주세요</strong>
            <span>위에서 날짜를 고르면 주일 예배와 순모임 출석을 한 화면에서 체크할 수 있습니다.</span>
          </article>
        ) : null}
        {!isWelcomeAttendanceOnly && hasExplicitAttendanceSelection && attendanceOverviewEvents.length > 0 ? (
          <section className="group-attendance-snapshot" aria-label={`${overviewGroupName} 출석현황`}>
            <div className="group-attendance-snapshot-heading">
              <div>
                <p className="eyebrow">출석현황</p>
                <h3>{overviewGroupName}</h3>
                <span>
                  {attendanceDate} · {attendanceOverviewMembers.length}명 표시
                </span>
              </div>
              <div className="snapshot-mini-metrics">
                <article>
                  <span>둘 다 출석</span>
                  <strong>{fullyPresentCount}</strong>
                  <small>예배와 순모임 모두 출석</small>
                </article>
                <article>
                  <span>확인 필요</span>
                  <strong>{needsCheckCount}</strong>
                  <small>미출석 항목이 있는 멤버</small>
                </article>
                {attendanceOverviewStats.map(({ event, presentCount, excusedCount, absentCount }) => (
                  <article key={event.id}>
                    <span>{event.title}</span>
                    <strong>{presentCount}/{attendanceOverviewMembers.length}</strong>
                    <small>미출석 {absentCount} · 사유 {excusedCount}</small>
                  </article>
                ))}
              </div>
            </div>
            <div
              className={`group-attendance-snapshot-grid ${attendanceOverviewEvents.length > 1 ? "two-events" : "single-event"}`}
            >
              <div className="snapshot-grid-row snapshot-grid-header">
                <div className="snapshot-grid-head member-name">이름</div>
                {attendanceOverviewEvents.map((event) => (
                  <div className="snapshot-grid-head" key={event.id}>
                    {event.title}
                  </div>
                ))}
              </div>
              {attendanceOverviewRows.map(({ member, missedCount, presentCount, statuses }) => (
                <div
                  className={`snapshot-grid-row snapshot-member-row ${missedCount === 0 && presentCount > 0 ? "all-present" : ""}`}
                  key={member.id}
                >
                  <button
                    className="snapshot-member-name"
                    title={member.displayName}
                    type="button"
                    onClick={() => setAttendanceMemberModal({ memberId: member.id, mode: "menu" })}
                  >
                    {member.displayName}
                  </button>
                  {statuses.map(({ event, status }) => {
                    return (
                      <button
                        aria-label={`${member.displayName} ${event.title} ${attendanceStatusLabels[status]}`}
                        className={`snapshot-status snapshot-status-button ${status}`}
                        disabled={!canManageAttendance || isPending}
                        key={event.id}
                        onClick={() => handleToggleAttendanceEvent(member, event, status !== "present")}
                        type="button"
                      >
                        {attendanceStatusLabels[status]}
                      </button>
                    );
                  })}
                </div>
              ))}
              {attendanceOverviewMembers.length === 0 ? (
                <div className="snapshot-empty-row">
                  조건에 맞는 멤버가 없습니다.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
        {!isWelcomeAttendanceOnly && hasExplicitAttendanceSelection && attendanceOverviewEvents.length === 0 ? (
        <div className="attendance-check-list">
          {attendanceMembers.map((member) => {
            const status = getMemberAttendanceStatus(member, attendanceEventId);
            return (
              <AttendanceRow
                attendanceDate={attendanceDate}
                attendanceEvents={sameDateEvents}
                canManageAttendance={canManageAttendance}
                isPending={isPending}
                key={member.id}
                member={member}
                onToggleEvent={(event, nextPresent) => handleToggleAttendanceEvent(member, event, nextPresent)}
                status={status}
              />
            );
          })}
          {attendanceMembers.length === 0 ? (
            <article className="empty-table-state attendance-empty-state">
              <strong>표시할 멤버가 없습니다</strong>
              <span>검색어나 순 필터를 조정해보세요.</span>
            </article>
          ) : null}
        </div>
        ) : null}
      </section>
      </div>
    </>
  );
}

function AttendanceMemberActionModal({
  member,
  attendanceEvents,
  onClose,
  onOpenReason,
}: {
  member: Member;
  attendanceEvents: AttendanceEvent[];
  onClose: () => void;
  onOpenReason: () => void;
}) {
  return (
    <div className="confirm-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-labelledby="attendance-member-action-title"
        aria-modal="true"
        className="confirm-modal attendance-member-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading compact-heading">
          <div>
            <p className="eyebrow">출석 멤버</p>
            <h2 id="attendance-member-action-title">{member.displayName}</h2>
            <p className="meta">{member.groupName}</p>
          </div>
          <button className="secondary-button table-action" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="attendance-member-status-list">
          {attendanceEvents.map((event) => {
            const status = getMemberAttendanceStatus(member, event.id);
            return (
              <div className="attendance-member-status-row" key={event.id}>
                <span>{event.title}</span>
                <strong className={`snapshot-status ${status}`}>{attendanceStatusLabels[status]}</strong>
              </div>
            );
          })}
        </div>
        <div className="attendance-member-modal-actions">
          <Link className="secondary-button" href={`/members/${member.id}`}>
            상세보기
          </Link>
          <button className="primary-button" type="button" onClick={onOpenReason}>
            사유 입력
          </button>
        </div>
      </div>
    </div>
  );
}

function AttendanceReasonModal({
  member,
  attendanceDate,
  attendanceEvents,
  canManageAttendance,
  onBack,
  onClose,
}: {
  member: Member;
  attendanceDate: string;
  attendanceEvents: AttendanceEvent[];
  canManageAttendance: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const [reasonState, reasonAction, isSavingReason] = useActionState(updateAttendanceReason, initialActionState);
  const defaultReasonEvent =
    attendanceEvents.find((event) => getMemberAttendanceStatus(member, event.id) !== "present") ?? attendanceEvents[0];
  const defaultReasonRecord = defaultReasonEvent
    ? member.attendanceHistory.find((record) => record.eventId === defaultReasonEvent.id)
    : null;
  const defaultVisibleNote =
    defaultReasonRecord?.note && !isImportedAttendanceNote(defaultReasonRecord.note) ? defaultReasonRecord.note : "";

  useEffect(() => {
    if (reasonState.ok) onClose();
  }, [onClose, reasonState.ok]);

  return (
    <div className="confirm-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-labelledby="attendance-reason-modal-title"
        aria-modal="true"
        className="confirm-modal attendance-member-modal attendance-reason-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading compact-heading">
          <div>
            <p className="eyebrow">사유 입력</p>
            <h2 id="attendance-reason-modal-title">{member.displayName}</h2>
            <p className="meta">{member.groupName}</p>
          </div>
          <button className="secondary-button table-action" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        {defaultReasonEvent ? (
          <form action={reasonAction} className="reason-form attendance-modal-reason-form">
            <input name="memberId" type="hidden" value={member.id} />
            <label>
              대상
              <select name="eventId" defaultValue={defaultReasonEvent.id} disabled={!canManageAttendance}>
                {attendanceEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              시작일
              <input
                name="excuseStartDate"
                type="date"
                defaultValue={defaultReasonRecord?.excuseStartDate || attendanceDate}
                disabled={!canManageAttendance}
              />
            </label>
            <label>
              종료일
              <input
                name="excuseEndDate"
                type="date"
                defaultValue={defaultReasonRecord?.excuseEndDate || attendanceDate}
                disabled={!canManageAttendance}
              />
            </label>
            <label className="reason-note-field">
              사유
              <textarea
                name="note"
                placeholder="여행, 건강, 가정 일정 등"
                defaultValue={defaultVisibleNote}
                disabled={!canManageAttendance}
              />
            </label>
            <ActionMessage state={reasonState} />
            <div className="attendance-member-modal-actions">
              <button className="secondary-button" type="button" onClick={onBack}>
                뒤로
              </button>
              <button className="primary-button" type="submit" disabled={!canManageAttendance || isSavingReason}>
                저장
              </button>
            </div>
          </form>
        ) : (
          <article className="empty-table-state">
            <strong>사유를 넣을 출석 이벤트가 없습니다</strong>
            <span>먼저 출석 날짜를 선택해주세요.</span>
          </article>
        )}
      </div>
    </div>
  );
}

function GroupMembersModal({
  canDeleteGroups,
  canManageGroups,
  deleteGroupState,
  group,
  groupLeaderOptions,
  isDeletingGroup,
  isRenamingGroup,
  isUpdatingGroup,
  lastDeletedGroupId,
  lastRenamedGroupId,
  lastUpdatedGroupId,
  members,
  onClose,
  renameGroupAction,
  renameGroupState,
  setGroupPendingDelete,
  setLastRenamedGroupId,
  setLastUpdatedGroupId,
  updateGroupAction,
  updateGroupState,
}: {
  canDeleteGroups: boolean;
  canManageGroups: boolean;
  deleteGroupState: ActionState;
  group: Group;
  groupLeaderOptions: Member[];
  isDeletingGroup: boolean;
  isRenamingGroup: boolean;
  isUpdatingGroup: boolean;
  lastDeletedGroupId: string | null;
  lastRenamedGroupId: string | null;
  lastUpdatedGroupId: string | null;
  members: Member[];
  onClose: () => void;
  renameGroupAction: (payload: FormData) => void;
  renameGroupState: ActionState;
  setGroupPendingDelete: (group: Group) => void;
  setLastRenamedGroupId: (id: string) => void;
  setLastUpdatedGroupId: (id: string) => void;
  updateGroupAction: (payload: FormData) => void;
  updateGroupState: ActionState;
}) {
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="confirm-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-labelledby="group-members-modal-title"
        aria-modal="true"
        className="confirm-modal group-members-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading compact-heading">
          <div>
            <h2 id="group-members-modal-title">{group.name} 멤버</h2>
            <p className="meta">리더 {group.leaderName} · {sortedMembers.length}명</p>
          </div>
          <button className="secondary-button table-action" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="group-modal-member-list">
          {sortedMembers.map((member) => (
            <article className="group-modal-member-row" key={member.id}>
              <div className="person-block">
                <strong>{member.displayName}</strong>
                <span>
                  {roleLabels[member.role]} · {statusLabels[member.status]}
                </span>
              </div>
              <Link className="secondary-button table-action" href={`/members/${member.id}`}>
                상세보기
              </Link>
            </article>
          ))}
          {sortedMembers.length === 0 ? (
            <article className="empty-table-state">
              <strong>배정된 멤버가 없습니다</strong>
              <span>순 카드에서 리더를 지정하거나 멤버 상세에서 순을 배정해주세요.</span>
            </article>
          ) : null}
        </div>
        {canManageGroups ? (
          <div className="group-modal-admin-tools">
            <form
              action={renameGroupAction}
              className="management-form group-rename-form"
              onSubmit={() => setLastRenamedGroupId(group.id)}
            >
              <input name="id" type="hidden" value={group.id} />
              <label>
                순 이름 변경
                <input name="name" required defaultValue={group.name} />
              </label>
              <div className="form-actions">
                {lastRenamedGroupId === group.id ? <ActionMessage state={renameGroupState} /> : null}
                <button className="secondary-button" type="submit" disabled={isRenamingGroup}>
                  이름 변경
                </button>
              </div>
            </form>
            <form
              action={updateGroupAction}
              className="management-form group-edit-form"
              onSubmit={() => setLastUpdatedGroupId(group.id)}
            >
              <input name="id" type="hidden" value={group.id} />
              <input name="name" type="hidden" value={group.name} />
              <label>
                리더
                <select name="leaderMemberId" defaultValue={group.leaderMemberId ?? ""}>
                  <option value="">미배정</option>
                  {groupLeaderOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName} · {member.groupName}
                    </option>
                  ))}
                </select>
              </label>
              {lastUpdatedGroupId === group.id ? <ActionMessage state={updateGroupState} /> : null}
              <button className="secondary-button" type="submit" disabled={isUpdatingGroup}>
                리더 저장
              </button>
            </form>
          </div>
        ) : null}
        {canDeleteGroups ? (
          <div className="group-modal-delete-row">
            <button
              className="danger-text-button"
              type="button"
              disabled={isDeletingGroup}
              onClick={() => {
                onClose();
                setGroupPendingDelete(group);
              }}
            >
              삭제
            </button>
            {lastDeletedGroupId === group.id ? <ActionMessage state={deleteGroupState} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AttendanceRow({
  member,
  attendanceDate,
  attendanceEvents,
  canManageAttendance,
  isPending,
  onToggleEvent,
  status,
}: {
  member: Member;
  attendanceDate: string;
  attendanceEvents: AttendanceEvent[];
  canManageAttendance: boolean;
  isPending: boolean;
  onToggleEvent: (event: AttendanceEvent, nextPresent: boolean) => void;
  status: AttendanceStatus;
}) {
  const [reasonState, reasonAction, isSavingReason] = useActionState(updateAttendanceReason, initialActionState);
  const visibleAttendanceEvents = attendanceEvents.length > 0 ? attendanceEvents : [];
  const visibleNotes = visibleAttendanceEvents
    .map((event) => {
      const record = member.attendanceHistory.find((item) => item.eventId === event.id);
      const note = record?.note && !isImportedAttendanceNote(record.note) ? record.note : "";
      return note ? `${event.title}: ${note}` : "";
    })
    .filter(Boolean);
  const defaultReasonEvent =
    visibleAttendanceEvents.find((event) => getMemberAttendanceStatus(member, event.id) !== "present") ?? visibleAttendanceEvents[0];
  const defaultReasonRecord = defaultReasonEvent
    ? member.attendanceHistory.find((record) => record.eventId === defaultReasonEvent.id)
    : null;
  const defaultVisibleNote =
    defaultReasonRecord?.note && !isImportedAttendanceNote(defaultReasonRecord.note) ? defaultReasonRecord.note : "";

  return (
    <article className={`attendance-row attendance-card ${status}`}>
      <div className="person-block">
        <strong>{member.displayName}</strong>
        <span>{member.groupName}</span>
        {visibleNotes.length > 0 ? <span>사유: {visibleNotes.join(" · ")}</span> : null}
      </div>
      <div className="attendance-actions attendance-type-actions">
        {visibleAttendanceEvents.map((event) => {
          const eventStatus = getMemberAttendanceStatus(member, event.id);
          const eventLabel = event.title === "주일 예배" ? "예배" : event.title;
          return (
            <div className={`attendance-type-action ${eventStatus}`} key={event.id}>
              <div className="attendance-type-action-main">
                <button
                  aria-label={`${event.title} ${attendanceStatusLabels[eventStatus]}`}
                  className={`attendance-toggle ${eventStatus}`}
                  disabled={!canManageAttendance || isPending}
                  onClick={() => onToggleEvent(event, eventStatus !== "present")}
                  type="button"
                >
                  {eventLabel} {attendanceStatusLabels[eventStatus]}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {defaultReasonEvent ? (
        <details className="reason-details attendance-reason-row">
          <summary>사유 입력</summary>
          <form action={reasonAction} className="reason-form compact-reason-form">
            <input name="memberId" type="hidden" value={member.id} />
            <label>
              대상
              <select name="eventId" defaultValue={defaultReasonEvent.id} disabled={!canManageAttendance}>
                {visibleAttendanceEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              시작일
              <input
                name="excuseStartDate"
                type="date"
                defaultValue={defaultReasonRecord?.excuseStartDate || attendanceDate}
                disabled={!canManageAttendance}
              />
            </label>
            <label>
              종료일
              <input
                name="excuseEndDate"
                type="date"
                defaultValue={defaultReasonRecord?.excuseEndDate || attendanceDate}
                disabled={!canManageAttendance}
              />
            </label>
            <label className="reason-note-field">
              사유
              <textarea
                name="note"
                placeholder="여행, 건강, 가정 일정 등"
                defaultValue={defaultVisibleNote}
                disabled={!canManageAttendance}
              />
            </label>
            <div className="form-actions reason-save-actions">
              <ActionMessage state={reasonState} />
              <button className="secondary-button" type="submit" disabled={!canManageAttendance || isSavingReason}>
                저장
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </article>
  );
}

function isImportedAttendanceNote(note: string) {
  return note.trim() === "Imported from 2026 annual attendance CSV";
}

function getMemberAttendanceStatus(member: Member, eventId?: string): AttendanceStatus {
  const currentRecord = member.attendanceHistory.find((record) => record.eventId === eventId);
  if (currentRecord?.status === "present") return "present";
  if (currentRecord?.status === "excused") return "excused";

  return "absent";
}

function isPresentForAnyEvent(member: Member, eventIds: string[]) {
  return getMemberAttendanceStatusForAnyEvent(member, eventIds) === "present";
}

function getMemberAttendanceStatusForAnyEvent(member: Member, eventIds: string[]): AttendanceStatus {
  const eventIdSet = new Set(eventIds);
  let hasExcused = false;
  for (const record of member.attendanceHistory) {
    if (!eventIdSet.has(record.eventId)) continue;
    if (record.status === "present") return "present";
    if (record.status === "excused") hasExcused = true;
  }
  return hasExcused ? "excused" : "absent";
}

function buildAggregateAttendanceStat(
  eventType: string,
  id: string,
  name: string,
  members: Member[],
  eventIds: Set<string>,
  eventCount: number,
) {
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

function isAttendanceRosterMember(member: Member) {
  return (member.status === "active" || member.status === "care") && !isStatsExcludedMember(member);
}

function updateLocalAttendanceHistory({
  attendanceDate,
  attendanceTitle,
  eventId,
  history,
  nextPresent,
}: {
  attendanceDate: string;
  attendanceTitle: string;
  eventId: string;
  history: Member["attendanceHistory"];
  nextPresent: boolean;
}) {
  const currentRecord = history.find((record) => record.eventId === eventId);
  const nextStatus: AttendanceStatus = nextPresent
    ? "present"
    : currentRecord?.note || currentRecord?.excuseStartDate || currentRecord?.excuseEndDate
      ? "excused"
      : "absent";
  const nextRecord = {
    eventId,
    eventDate: currentRecord?.eventDate || attendanceDate,
    title: currentRecord?.title || attendanceTitle,
    status: nextStatus,
    note: currentRecord?.note ?? "",
    excuseStartDate: currentRecord?.excuseStartDate ?? "",
    excuseEndDate: currentRecord?.excuseEndDate ?? "",
  };

  return currentRecord ? history.map((record) => (record.eventId === eventId ? nextRecord : record)) : [nextRecord, ...history];
}

export function PermissionsPageContent({ user, members, groups, memberLinkRequests = [], deletedAuthUsers = [], globalStats }: AppDataProps) {
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [roleState, roleAction, isUpdatingRole] = useActionState(updateMemberRole, initialActionState);
  const [approveState, approveAction, isApprovingRequest] = useActionState(approveMemberLinkRequest, initialActionState);
  const [rejectState, rejectAction, isRejectingRequest] = useActionState(rejectMemberLinkRequest, initialActionState);
  const [reopenState, reopenAction, isReopeningRequest] = useActionState(reopenMemberLinkRequest, initialActionState);
  const [restoreState, restoreAction, isRestoringDeletedUser] = useActionState(restoreDeletedAuthUser, initialActionState);
  const canManageRoles = hasPermission(user.role, "roles:manage");
  const assignableRoleEntries = getAssignableRoleEntries(user.role);
  const userLedGroupIds = new Set(groups.filter((group) => group.leaderMemberId === user.id).map((group) => group.id));
  const pendingLinkRequests = memberLinkRequests.filter(isActionableLinkRequest);
  const rejectedLinkRequests = memberLinkRequests
    .filter((request) => request.status === "rejected" && request.requesterStatus !== "inactive")
    .slice(0, 10);
  const permissionRoleCounts = globalStats?.permissions.roleCounts ?? [];
  const roleCountByRole = new Map(permissionRoleCounts.map((row) => [row.role, row.count]));
  const activeAdmins = members.filter((member) => member.role === "admin" && member.status !== "inactive");
  const activeAdminCount = globalStats?.permissions.activeAdminCount ?? activeAdmins.length;
  const leaderAndStaffCount =
    globalStats?.permissions.leaderAndStaffCount ??
    members.filter((member) => member.status !== "inactive" && (member.role === "leader" || member.role === "staff")).length;
  const ownerAndAdmins = members.filter(
    (member) => (member.role === "owner" || member.role === "admin") && member.status !== "inactive",
  );
  const visiblePermissionEntries = (Object.entries(permissionsByRole) as Array<[Role, (typeof permissionsByRole)[Role]]>).filter(
    (entry): entry is [Exclude<Role, "owner">, (typeof permissionsByRole)[Exclude<Role, "owner">]] => entry[0] !== "owner",
  );
  const visibleRoleMembers = members.filter((member) => member.status !== "inactive" && !isMergedPlaceholderMember(member));
  const unlinkedActiveMembers = members
    .filter((member) => !member.authUserId && member.status !== "inactive" && !isMergedPlaceholderMember(member))
    .sort((a, b) => a.name.localeCompare(b.name));
  const roleManagedMembers = [...members]
    .filter((member) => member.status !== "inactive")
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name));
  const normalizedRoleSearchQuery = roleSearchQuery.trim().toLowerCase();
  const filteredRoleManagedMembers = roleManagedMembers.filter((member) => {
    if (!normalizedRoleSearchQuery) return true;

    return [
      member.displayName,
      member.email,
      member.groupName,
      roleLabels[member.role],
      member.authUserId ? "google 연결" : "미연결",
    ].some((value) => (value ?? "").toLowerCase().includes(normalizedRoleSearchQuery));
  });

  return (
    <>
      <PageHeader eyebrow="권한 관리" title="권한" user={user} />
      <SectionNav
        items={[
          { href: "#permission-metrics", label: "요약" },
          { href: "#permission-matrix", label: "권한표" },
          { href: "#admin-checks", label: "관리자 체크" },
          { href: "#link-requests", label: "연결 요청" },
          { href: "#deleted-account-restore", label: "계정 복구" },
          { href: "#role-management", label: "역할 변경" },
        ]}
      />
      <div className="metric-grid" id="permission-metrics">
        <article className="metric-card">
          <span>관리자</span>
          <strong>{activeAdminCount}</strong>
          <small>운영 관리자</small>
        </article>
        <article className="metric-card">
          <span>리더/순장</span>
          <strong>{leaderAndStaffCount}</strong>
          <small>운영 권한 보유</small>
        </article>
        <article className="metric-card">
          <span>웰컴팀</span>
          <strong>{roleCountByRole.get("welcome") ?? visibleRoleMembers.filter((member) => member.role === "welcome").length}</strong>
          <small>새가족/예배 보조</small>
        </article>
      </div>

      <section className="panel form-panel" id="permission-matrix">
        <div className="panel-heading">
          <div>
            <h2>역할 기반 권한</h2>
            <p className="meta">로그인한 사용자 역할에 따라 메뉴와 데이터 접근이 제한됩니다.</p>
          </div>
        </div>
        <div className="permission-matrix">
          {visiblePermissionEntries.map(([role, permissions]) => {
            const summary = rolePermissionSummaries[role];
            const roleMembers = visibleRoleMembers.filter((member) => member.role === role).sort((a, b) => a.name.localeCompare(b.name));
            const roleMemberCount = roleCountByRole.get(role) ?? roleMembers.length;
            const hasFullRoleMemberList = roleMembers.length === roleMemberCount;
            return (
              <article className="permission-row" key={role} tabIndex={0}>
                <div className="person-block permission-role-summary">
                  <strong>{roleLabels[role]}</strong>
                  <span>{roleMemberCount}명 배정</span>
                  <div className="role-member-overlay" role="tooltip">
                    <div className="role-member-overlay-heading">
                      <strong>{roleLabels[role]} 멤버</strong>
                      <span>{roleMemberCount}명</span>
                    </div>
                    <div className="role-member-overlay-list">
                      {roleMembers.slice(0, 12).map((member) => (
                        <span className="role-member-overlay-item" key={member.id}>
                          <strong>{member.displayName}</strong>
                          <small>{member.groupName}</small>
                        </span>
                      ))}
                      {hasFullRoleMemberList && roleMembers.length > 12 ? (
                        <span className="role-member-overlay-more">+{roleMembers.length - 12}명 더 있음</span>
                      ) : null}
                      {!hasFullRoleMemberList ? (
                        <span className="role-member-overlay-more">상세 명단은 현재 열람 가능한 멤버만 표시됩니다</span>
                      ) : null}
                      {roleMemberCount === 0 ? <span className="role-member-overlay-empty">배정된 멤버가 없습니다</span> : null}
                    </div>
                  </div>
                </div>
                <div className="permission-summary-grid" aria-label={`${roleLabels[role]} 권한 요약`}>
                  <div>
                    <span>접근 범위</span>
                    <strong>{summary.scope}</strong>
                  </div>
                  <div>
                    <span>주요 가능 작업</span>
                    <strong>{summary.can}</strong>
                  </div>
                  <div>
                    <span>제한</span>
                    <strong>{summary.limits}</strong>
                  </div>
                </div>
                <div className="permission-list">
                  {permissions.map((permission) => (
                    <span className="permission-chip" key={permission}>
                      {permissionLabels[permission]}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <DisclosurePanel
        id="admin-checks"
        title="관리자 온보딩 체크"
        meta={canManageRoles ? "역할 변경은 관리자 이상만 가능합니다" : "관리자 권한 필요"}
      >
        <div className="onboarding-list">
          <article className="detail-row">
            <div className="person-block">
              <strong>관리자 Google 계정 연결</strong>
              <span>관리자 권한은 실제 로그인 계정과 연결된 멤버에 부여하는 것이 안전합니다.</span>
            </div>
            <span className={`status-pill ${ownerAndAdmins.some((member) => member.authUserId) ? "active" : ""}`}>
              {ownerAndAdmins.some((member) => member.authUserId) ? "정상" : "확인 필요"}
            </span>
          </article>
        </div>
      </DisclosurePanel>

      <section className="panel form-panel link-request-section" id="link-requests">
        <div className="panel-heading link-request-heading">
          <div>
            <h2>교적 연결 요청</h2>
            <p className="meta">첫 로그인 사용자가 기존 CSV 교적 멤버와 연결을 요청하면 여기서 승인합니다.</p>
          </div>
          <span className={`request-count-pill ${pendingLinkRequests.length > 0 ? "active" : ""}`}>
            {pendingLinkRequests.length}건 대기
          </span>
        </div>
        <div className="role-management-list">
          {pendingLinkRequests.map((request) => (
            <article className="link-request-card" key={request.id}>
              <div className="link-request-layout">
                <div className="link-request-summary">
                  <span className="status-pill">요청자</span>
                  <strong>{request.requesterName}</strong>
                  <span>{request.requesterEmail || "이메일 없음"}</span>
                  <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString("ko-KR")}</time>
                  {request.note ? <p>메모: {request.note}</p> : null}
                </div>
                <div className="link-request-workspace">
                  <div className="link-request-target">
                    <div className="person-block">
                      <strong>관리자 확인 필요</strong>
                      <span>
                        요청자가 선택한 대상 · {request.targetName}
                        {request.targetEmail ? ` · ${request.targetEmail}` : request.targetMemberId ? " · 이메일 없음" : ""}
                      </span>
                    </div>
                    <strong>승인 전에 올바른 교적으로 바꿀 수 있습니다</strong>
                  </div>
                  <div className="link-request-resolution">
                    <label>
                      처리 방식
                      <select name="createTargetMode" form={`approve-link-request-${request.id}`} disabled={!canManageRoles}>
                        <option value="existing">기존 교적에 연결</option>
                        <option value="new">새 교적 생성 후 연결</option>
                      </select>
                    </label>
                    <label>
                      승인할 교적 멤버
                      <select
                        name="targetMemberId"
                        form={`approve-link-request-${request.id}`}
                        defaultValue={request.targetMemberId ?? ""}
                        disabled={!canManageRoles}
                      >
                        <option value="">선택</option>
                        {unlinkedActiveMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName} · {member.groupName} · {member.email || "이메일 없음"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="new-member-inline-fields">
                      <label>
                        새 이름
                        <input
                          name="newMemberName"
                          form={`approve-link-request-${request.id}`}
                          placeholder={request.requesterName}
                          disabled={!canManageRoles}
                        />
                      </label>
                      <label>
                        이메일
                        <input
                          name="newMemberEmail"
                          form={`approve-link-request-${request.id}`}
                          placeholder={request.requesterEmail || "선택 입력"}
                          disabled={!canManageRoles}
                        />
                      </label>
                      <label>
                        전화번호
                        <input
                          name="newMemberPhone"
                          form={`approve-link-request-${request.id}`}
                          placeholder="선택 입력"
                          disabled={!canManageRoles}
                        />
                      </label>
                      <label>
                        순
                        <select name="newMemberGroupId" form={`approve-link-request-${request.id}`} disabled={!canManageRoles}>
                          <option value="">미배정</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="toggle-field full-width">
                        <input name="isTestAccount" type="checkbox" form={`approve-link-request-${request.id}`} disabled={!canManageRoles} />
                        테스트 계정으로 승인하고 모든 통계에서 제외
                      </label>
                    </div>
                  </div>
                  <div className="request-actions">
                    <form action={approveAction} id={`approve-link-request-${request.id}`}>
                      <input name="id" type="hidden" value={request.id} />
                      <button className="primary-button" type="submit" disabled={!canManageRoles || isApprovingRequest}>
                        승인
                      </button>
                    </form>
                    <form action={rejectAction}>
                      <input name="id" type="hidden" value={request.id} />
                      <button className="danger-button" type="submit" disabled={!canManageRoles || isRejectingRequest}>
                        거절
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {pendingLinkRequests.length === 0 ? (
            <article className="request-empty-state">
              <span className="request-empty-mark" aria-hidden="true" />
              <div className="person-block">
                <strong>대기 중인 요청이 없습니다</strong>
                <span>새 사용자가 내 프로필에서 연결 요청을 만들면 이곳에 표시됩니다.</span>
              </div>
            </article>
          ) : null}
        </div>
        <ActionMessage state={approveState} />
        <ActionMessage state={rejectState} />
        {rejectedLinkRequests.length > 0 ? (
          <div className="review-queue">
            <div className="panel-heading compact-heading">
              <div>
                <h3>거절된 요청 다시 검토</h3>
                <p className="meta">실수로 거절했거나 추가 확인이 끝난 요청은 다시 대기 상태로 돌릴 수 있습니다.</p>
              </div>
              <span>{rejectedLinkRequests.length}건</span>
            </div>
            <div className="role-management-list">
              {rejectedLinkRequests.map((request) => (
                <article className="definition-row rejected-review-row" key={request.id}>
                  <div className="person-block">
                    <strong>{request.requesterName}</strong>
                    <span>
                      {request.requesterEmail || "이메일 없음"} · 거절일{" "}
                      {request.resolvedAt ? new Date(request.resolvedAt).toLocaleString("ko-KR") : "기록 없음"}
                    </span>
                    <span>
                      연결 대상 · {request.targetName}
                      {request.note ? ` · 메모: ${request.note}` : ""}
                    </span>
                  </div>
                  <form action={reopenAction}>
                    <input name="id" type="hidden" value={request.id} />
                    <button className="secondary-button" type="submit" disabled={!canManageRoles || isReopeningRequest}>
                      다시 검토
                    </button>
                  </form>
                </article>
              ))}
            </div>
            <ActionMessage state={reopenState} />
          </div>
        ) : null}
      </section>

      <section className="panel form-panel" id="deleted-account-restore">
        <div className="panel-heading">
          <div>
            <h2>삭제된 계정 복구</h2>
            <p className="meta">삭제된 계정 사용자가 다시 로그인해 복구를 요청하면 여기서 승인합니다.</p>
          </div>
          <span>{deletedAuthUsers.length}건</span>
        </div>
        <div className="role-management-list">
          {deletedAuthUsers.map((deletedUser) => (
            <article className="definition-row" key={deletedUser.authUserId}>
              <div className="person-block">
                <strong>{deletedUser.deletedMemberName}</strong>
                <span>
                  {deletedUser.deletedMemberEmail || "이메일 없음"} · 삭제일{" "}
                  {deletedUser.deletedAt ? new Date(deletedUser.deletedAt).toLocaleString("ko-KR") : "기록 없음"}
                </span>
                <span>
                  요청일 · {deletedUser.restoreRequestedAt ? new Date(deletedUser.restoreRequestedAt).toLocaleString("ko-KR") : "기록 없음"}
                </span>
                {deletedUser.restoreRequestNote ? <span>메모: {deletedUser.restoreRequestNote}</span> : null}
                <span>
                  {deletedUser.restoreData
                    ? "삭제 전 교적 정보로 복원할 수 있습니다."
                    : "삭제 전 교적 스냅샷이 없어 차단 해제만 가능합니다."}
                </span>
              </div>
              <form action={restoreAction}>
                <input name="authUserId" type="hidden" value={deletedUser.authUserId} />
                <button className="secondary-button" type="submit" disabled={!canManageRoles || isRestoringDeletedUser}>
                  복구
                </button>
              </form>
            </article>
          ))}
          {deletedAuthUsers.length === 0 ? (
            <article className="request-empty-state">
              <span className="request-empty-mark" aria-hidden="true" />
              <div className="person-block">
                <strong>복구할 삭제 계정이 없습니다</strong>
                <span>삭제된 계정 사용자가 복구를 요청하면 이곳에 표시됩니다.</span>
              </div>
            </article>
          ) : null}
        </div>
        <ActionMessage state={restoreState} />
      </section>

      <section className="panel form-panel" id="role-management">
        <div className="panel-heading">
          <h2>멤버 역할 변경</h2>
          <span>
            {filteredRoleManagedMembers.length} / {roleManagedMembers.length}명
          </span>
        </div>
        <div className="role-management-toolbar">
          <label className="search-field">
            멤버 검색
            <input
              type="search"
              value={roleSearchQuery}
              onChange={(event) => setRoleSearchQuery(event.target.value)}
              placeholder="이름, 이메일, 순, 역할"
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={!roleSearchQuery}
            onClick={() => setRoleSearchQuery("")}
          >
            초기화
          </button>
        </div>
        <div className="role-management-list">
          {filteredRoleManagedMembers.map((member) => {
            const canManageAssistantRole =
              (user.role === "leader" || user.role === "staff") &&
              (member.role === "member" || member.role === "assistant") &&
              (user.role === "leader" || Boolean(member.groupId && userLedGroupIds.has(member.groupId)));
            const canUseRoleControl = canManageRoles || canManageAssistantRole;
            const roleOptions = canUseRoleControl ? assignableRoleEntries : ([[member.role, roleLabels[member.role]]] as Array<[Role, string]>);
            return (
              <form action={roleAction} className="role-management-row" key={member.id}>
                <input name="id" type="hidden" value={member.id} />
                <div className="person-block">
                  <strong>{member.displayName}</strong>
                  <span>
                    {member.groupName} · {member.email || "이메일 없음"} · {member.authUserId ? "Google 연결" : "미연결"}
                  </span>
                </div>
                <select name="role" defaultValue={member.role} disabled={!canUseRoleControl}>
                  {roleOptions.map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
                <button className="secondary-button" type="submit" disabled={!canUseRoleControl || isUpdatingRole}>
                  변경
                </button>
              </form>
            );
          })}
          {filteredRoleManagedMembers.length === 0 ? (
            <article className="empty-state">
              <strong>검색 결과가 없습니다</strong>
              <span>이름, 이메일, 순 이름, 역할을 다시 확인해주세요.</span>
            </article>
          ) : null}
        </div>
        <ActionMessage state={roleState} />
      </section>

    </>
  );
}

export function AuditLogPageContent({ user, auditLogs }: { user: AppUser; auditLogs: AuditLog[] }) {
  const canReadAuditLogs = hasPermission(user.role, "roles:manage");

  return (
    <>
      <PageHeader eyebrow="운영 감사" title="감사 로그" user={user} />
      <SectionNav items={[{ href: "#audit-list", label: "최근 변경 내역" }]} />
      <section className="panel" id="audit-list">
        <div className="panel-heading">
          <h2>최근 변경 내역</h2>
          <span>{canReadAuditLogs ? `${auditLogs.length}건` : "관리자 권한 필요"}</span>
        </div>
        {canReadAuditLogs ? (
          <div className="audit-list">
            {auditLogs.map((log) => (
              <article className="audit-row" key={log.id}>
                <div className="person-block">
                  <strong>{auditActionLabels[log.action] ?? log.action}</strong>
                  <span>
                    {log.actorName} · {log.targetTable}
                    {log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ""}
                  </span>
                  {log.eventSummaries.length > 0 ? (
                    <span>이벤트: {log.eventSummaries.join(", ")}</span>
                  ) : null}
                  {log.memberSummaries.length > 0 ? (
                    <span>멤버: {log.memberSummaries.join(", ")}</span>
                  ) : null}
                </div>
                <time className="meta" dateTime={log.createdAt}>
                  {new Date(log.createdAt).toLocaleString("ko-KR")}
                </time>
                <details className="audit-details">
                  <summary>변경값</summary>
                  <pre>{JSON.stringify({ before: log.beforeData, after: log.afterData, metadata: log.metadata }, null, 2)}</pre>
                </details>
              </article>
            ))}
            {auditLogs.length === 0 ? (
              <article className="care-item">
                <div className="person-block">
                  <strong>아직 기록이 없습니다</strong>
                  <span>멤버/순/출석 변경이 발생하면 이곳에 기록됩니다.</span>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <article className="care-item">
            <div className="person-block">
              <strong>감사 로그 접근 제한</strong>
              <span>관리자만 감사 로그를 확인할 수 있습니다.</span>
            </div>
          </article>
        )}
      </section>
    </>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p className={`action-message ${state.ok ? "success" : "error"}`} role="status">
      {state.message}
    </p>
  );
}

function BaptismStatusSelect({ value, disabled }: { value: unknown; disabled: boolean }) {
  const normalizedValue = normalizeBaptismStatus(value);

  return (
    <select name="baptismStatus" defaultValue={normalizedValue} disabled={disabled}>
      <option value="">미입력</option>
      {baptismStatusOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function EmptyMemberDetailPreview({ groups }: { groups: Group[] }) {
  return (
    <form className="management-form" aria-label="멤버 상세 미리보기">
      <label>
        이름
        <input placeholder="예: 홍길동" disabled />
      </label>
      <label>
        이메일
        <input type="email" placeholder="미입력" disabled />
      </label>
      <label>
        연락처
        <input placeholder="미입력" disabled />
      </label>
      <label>
        순
        <select defaultValue="" disabled>
          <option value="">미배정</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        역할
        <select defaultValue="member" disabled>
          {Object.entries(roleLabels).map(([role, label]) => (
            <option key={role} value={role}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        상태
        <select defaultValue="active" disabled>
          <option value="active">활동</option>
          <option value="new">새가족</option>
          <option value="care">돌봄 필요</option>
          <option value="inactive">비활성화</option>
        </select>
      </label>
      <label>
        주소
        <input placeholder="미입력" disabled />
      </label>
      <label>
        세례/등록
        <BaptismStatusSelect value="" disabled />
      </label>
      <label className="full-width">
        커스텀 메모
        <textarea placeholder="미입력" disabled />
      </label>
      <div className="form-actions full-width">
        <button className="primary-button" type="button" disabled>
          저장
        </button>
      </div>
    </form>
  );
}

function PageHeader({
  eyebrow,
  title,
  user,
  children,
}: {
  eyebrow: string;
  title: string;
  user: AppUser;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar-title-group">
        <span className="ui-emoji page-title-emoji" aria-hidden="true">
          {getPageEmoji(title)}
        </span>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="meta">
            {user.name} · {roleLabels[user.role]} 권한
          </p>
        </div>
      </div>
      {children ? <div className="topbar-actions">{children}</div> : null}
    </header>
  );
}

function GroupSummaryPanel({
  attendanceEvents,
  groupMemberStats,
  groupStats,
  members,
  groups,
}: {
  attendanceEvents: AttendanceEvent[];
  groupMemberStats?: GlobalAppStats["groupPage"]["groups"];
  groupStats?: GlobalAppStats["groupAttendanceSummary"];
  members: Member[];
  groups: Group[];
}) {
  const worshipEvents = attendanceEvents.filter((event) => event.title === "주일 예배");
  const groupMeetingEvents = attendanceEvents.filter((event) => event.title === "순모임");

  return (
    <section className="panel" id="group-summary">
      <div className="panel-heading">
        <h2>순 현황</h2>
        <span>최근/평균 출석률</span>
      </div>
      <div className="group-summary">
        {groups.map((group) => {
          const groupMembers = members.filter((member) => member.groupName === group.name);
          const worship = buildDashboardGroupAttendanceRates(groupMembers, worshipEvents);
          const groupMeeting = buildDashboardGroupAttendanceRates(groupMembers, groupMeetingEvents);
          const globalMemberStats = groupMemberStats?.find((item) => item.id === group.id);
          const globalGroupStats = groupStats?.find((item) => item.id === group.id);
          return (
            <article className="summary-row group-attendance-summary-row" key={group.id}>
              <div className="person-block">
                <strong>{group.name}</strong>
                <span>
                  리더 {group.leaderName} · {globalMemberStats?.memberCount ?? groupMembers.length}명
                </span>
              </div>
              <div className="group-attendance-metrics">
                <DashboardGroupRate label="최근 예배" value={globalGroupStats?.latestWorshipRate ?? worship.latestRate} />
                <DashboardGroupRate label="평균 예배" value={globalGroupStats?.averageWorshipRate ?? worship.averageRate} />
                <DashboardGroupRate label="최근 순모임" value={globalGroupStats?.latestGroupMeetingRate ?? groupMeeting.latestRate} />
                <DashboardGroupRate label="평균 순모임" value={globalGroupStats?.averageGroupMeetingRate ?? groupMeeting.averageRate} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DashboardGroupRate({ label, value }: { label: string; value: number | null }) {
  return (
    <span className={`dashboard-rate-pill ${value !== null && value >= 70 ? "strong" : ""}`}>
      <small>{label}</small>
      <strong>{value === null ? "-" : `${value}%`}</strong>
    </span>
  );
}

function buildDashboardGroupAttendanceRates(members: Member[], events: AttendanceEvent[]) {
  const latestEvent = events[0];
  const latestRate = latestEvent ? calculateEventAttendanceRate(members, latestEvent.id) : null;
  const possibleCount = members.length * events.length;
  if (!possibleCount) {
    return { latestRate, averageRate: null };
  }

  const eventIds = new Set(events.map((event) => event.id));
  let presentCount = 0;
  for (const member of members) {
    for (const record of member.attendanceHistory) {
      if (eventIds.has(record.eventId) && record.status === "present") presentCount += 1;
    }
  }

  return {
    latestRate,
    averageRate: Math.round((presentCount / possibleCount) * 100),
  };
}

function calculateEventAttendanceRate(members: Member[], eventId: string) {
  if (!members.length) return 0;
  const presentCount = members.filter((member) =>
    member.attendanceHistory.some((record) => record.eventId === eventId && record.status === "present"),
  ).length;
  return Math.round((presentCount / members.length) * 100);
}

const roleLabels: Record<Role, string> = {
  owner: "최고 관리자",
  admin: "관리자",
  leader: "리더",
  staff: "순장",
  assistant: "부순장",
  welcome: "웰컴팀",
  member: "멤버",
};

const rolePermissionSummaries: Record<Exclude<Role, "owner">, { scope: string; can: string; limits: string }> = {
  admin: {
    scope: "운영 전체",
    can: "멤버, 출석, 순, 권한, 새가족, 민감 정보 관리",
    limits: "최고 관리자 권한은 변경 불가",
  },
  leader: {
    scope: "공동체 운영",
    can: "멤버/출석/순 운영, 링크 추가, 삭제 가능",
    limits: "권한 변경, 민감 정보, 새가족 관리는 불가",
  },
  staff: {
    scope: "본인 순 운영",
    can: "본인이 리드하는 순 멤버 수정, 출석 체크, 부순장 지정, 링크 추가",
    limits: "다른 순 멤버 수정/출석 체크, 권한 변경, 새가족 관리는 불가",
  },
  assistant: {
    scope: "본인 순 출석",
    can: "본인 소속 순 멤버 출석 체크와 사유 입력",
    limits: "멤버 정보 수정, 다른 순 출석 체크, 권한 변경은 불가",
  },
  welcome: {
    scope: "웰컴팀 업무",
    can: "새가족 읽기/수정, 예배 추가 출석 입력, 링크 보기",
    limits: "멤버 수정, 순 수정, 멤버 출석 체크, 권한 변경은 불가",
  },
  member: {
    scope: "본인 중심",
    can: "대시보드, 내 프로필, 내 출석, 순 기본 정보, 링크 보기",
    limits: "운영 데이터 수정과 관리자 기능은 불가",
  },
};

const roleOrder: Record<Role, number> = {
  owner: 0,
  admin: 1,
  leader: 2,
  staff: 3,
  assistant: 4,
  welcome: 5,
  member: 6,
};

function getAssignableRoleEntries(actorRole: Role): Array<[Role, string]> {
  const entries = Object.entries(roleLabels) as Array<[Role, string]>;
  if (actorRole === "owner") return entries;
  if (actorRole === "admin") return entries.filter(([role]) => role !== "owner");
  if (actorRole === "leader" || actorRole === "staff") {
    return entries.filter(([role]) => role === "assistant" || role === "member");
  }
  return entries.filter(([role]) => role === actorRole);
}

const statusLabels: Record<Member["status"], string> = {
  active: "활동",
  new: "새가족",
  care: "돌봄 필요",
  inactive: "비활성화",
};

const attendanceFilterLabels = {
  all: "전체",
  present: "출석",
  absent: "미확인",
  excused: "사유 있음",
};

const attendanceStatusLabels = {
  present: "출석",
  absent: "미출석",
  excused: "사유 있음",
};

const permissionLabels = {
  "members:read": "멤버 보기",
  "members:write": "멤버 수정",
  "attendance:read": "출석 보기",
  "attendance:write": "출석 체크",
  "attendance:extras:read": "총 출석 보기",
  "attendance:extras:write": "총 출석 입력",
  "groups:read": "순 보기",
  "groups:write": "순 수정",
  "roles:manage": "권한 관리",
  "owner:manage": "최고 관리자 관리",
  "sensitive:read": "민감 정보 열람",
  "links:read": "링크 보기",
  "links:write": "링크 추가",
  "new-family:read": "새가족 보기",
  "new-family:write": "새가족 수정",
};

const auditActionLabels: Record<string, string> = {
  "member.create": "멤버 생성",
  "member.update": "멤버 수정",
  "member.deactivate": "멤버 비활성화",
  "member.reactivate": "멤버 다시 활성화",
  "member.account_merge": "멤버 계정 연결",
  "member.profile_merge": "멤버 프로필 병합",
  "member.custom_fields.update": "멤버 커스텀 필드 수정",
  "group.create": "순 생성",
  "group.update": "순 수정",
  "group.delete": "순 삭제",
  "attendance_event.create": "출석 이벤트 생성",
  "attendance.toggle": "출석 변경",
  "attendance.reason.update": "출석 사유 수정",
  "care_followup.create": "돌봄 팔로업 생성",
  "care_followup.update": "돌봄 팔로업 수정",
  "custom_field.create": "커스텀 필드 생성",
};
