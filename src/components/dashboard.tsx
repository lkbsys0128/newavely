"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createAttendanceEvent,
  createAdminFeedbackMessage,
  createGroup,
  createImportantLink,
  createMember,
  deleteAttendanceEvent,
  deleteGroup,
  deleteImportantLink,
  deleteMemberPermanently,
  deactivateMember,
  exportMembersToGoogleSheet,
  approveMemberLinkRequest,
  rejectMemberLinkRequest,
  reopenMemberLinkRequest,
  reactivateMember,
  restoreDeletedAuthUser,
  toggleAttendance,
  updateAttendanceReason,
  updateAdminFeedbackMessage,
  updateGroup,
  updateMember,
  updateMemberRole,
  type ActionState,
} from "@/app/actions";
import { hasPermission, permissionsByRole, type Role } from "@/lib/rbac";
import { canDeleteMemberRole, canUseDeleteActions } from "@/lib/role-policy";
import type { AppUser, DashboardMetrics, GlobalAppStats } from "@/lib/app-page-data";
import type {
  AttendanceEvent,
  AuditLog,
  DeletedAuthUser,
  Group,
  ImportantLink,
  Member,
  AdminFeedbackMessage,
  MemberLinkRequest,
  MemberStatusMessage,
} from "@/lib/types";
import {
  defaultMemberFilters,
  filterMembers,
  findPotentialDuplicateMembers,
  isMergedPlaceholderMember,
  type MemberFilters,
} from "@/lib/member-filters";
import { isActionableLinkRequest } from "@/lib/member-link-requests";
import {
  baptismStatusOptions,
  calculateKoreanAge,
  ministryOptions,
  normalizeBaptismStatus,
  normalizeJobValue,
  normalizeMinistryValue,
} from "@/lib/member-field-options";
import { getMemberEnglishName } from "@/lib/member-names";
import { SectionNav } from "@/components/section-nav";
import { DisclosurePanel } from "@/components/disclosure-panel";

type AppDataProps = {
  user: AppUser;
  members: Member[];
  groups: Group[];
  attendanceEvents?: AttendanceEvent[];
  memberLinkRequests?: MemberLinkRequest[];
  deletedAuthUsers?: DeletedAuthUser[];
  importantLinks?: ImportantLink[];
  memberStatusMessages?: MemberStatusMessage[];
  adminFeedbackMessages?: AdminFeedbackMessage[];
  dashboardMetrics?: DashboardMetrics;
  globalStats?: GlobalAppStats;
};

type AttendanceFilter = "all" | "present" | "absent" | "excused";
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
  const dashboardMembers = members.filter((member) => !isMergedPlaceholderMember(member));
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
  const dashboardInsights = buildDashboardInsights(activeMembers, groups);
  const statisticsSummary = globalStats?.statisticsSummary ?? dashboardInsights.statisticsSummary;

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
    const ministries = [getCustomFieldString(member, "ministry_1"), getCustomFieldString(member, "ministry_2")]
      .map((value) => normalizeMinistryValue(value))
      .filter(Boolean);
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
  return [
    normalizeMinistryValue(getCustomFieldString(member, "ministry_1")),
    normalizeMinistryValue(getCustomFieldString(member, "ministry_2")),
  ].filter(Boolean);
}

function getCustomFieldString(member: Member, key: string) {
  const value = member.customFields[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
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
            세례/등록
            <BaptismStatusSelect value="" disabled={!canManageMembers} />
          </label>
          <label>
            메모
            <input name="notes" placeholder="돌봄 메모" disabled={!canManageMembers} />
          </label>
          <label>
            역할
            <select name="role" disabled={!canManageRoles}>
              {assignableRoleEntries.map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            상태
            <select name="status" disabled={!canManageMembers}>
              <option value="active">활동</option>
              <option value="new">새가족</option>
              <option value="care">돌봄 필요</option>
            </select>
          </label>
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
                      <strong>{member.displayName}</strong>
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
              <label>
                주소
                <input name="address" defaultValue={selectedMember.address} disabled={!canManageMembers} />
              </label>
              <label>
                세례/등록
                <BaptismStatusSelect value={selectedMember.baptismStatus} disabled={!canManageMembers} />
              </label>
              <label className="full-width">
                커스텀 메모
                <textarea name="notes" defaultValue={selectedMember.notes} disabled={!canManageMembers} />
              </label>
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

export function GroupsPageContent({ user, members, groups, globalStats }: AppDataProps) {
  const canManageGroups = hasPermission(user.role, "groups:write");
  const canDeleteGroups = canUseDeleteActions(user.role);
  const [groupPendingDelete, setGroupPendingDelete] = useState<Group | null>(null);
  const [groupMembersModal, setGroupMembersModal] = useState<Group | null>(null);
  const [lastUpdatedGroupId, setLastUpdatedGroupId] = useState<string | null>(null);
  const [lastDeletedGroupId, setLastDeletedGroupId] = useState<string | null>(null);
  const [createGroupState, createGroupAction, isCreatingGroup] = useActionState(createGroup, initialActionState);
  const [updateGroupState, updateGroupAction, isUpdatingGroup] = useActionState(updateGroup, initialActionState);
  const [deleteGroupState, deleteGroupAction, isDeletingGroup] = useActionState(deleteGroup, initialActionState);
  const activeMembers = members.filter((member) => member.status !== "inactive" && !isMergedPlaceholderMember(member));
  const unassignedMembers = activeMembers.filter((member) => !member.groupId);
  const assignedMembers = activeMembers.filter((member) => member.groupId);
  const assignedLeaderCount = groups.filter((group) => group.leaderMemberId).length;
  const groupStats = globalStats?.groupPage;
  const groupLeaderOptions = [...activeMembers].sort((a, b) => a.name.localeCompare(b.name));

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
          { href: "#group-create", label: "순 추가" },
          { href: "#group-list", label: "순 목록" },
          { href: "#unassigned-members", label: "미배정" },
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
          <strong>{groups.length}</strong>
          <small>현재 등록된 순</small>
        </article>
        <article className="metric-card">
          <span>미배정</span>
          <strong>{groupStats?.unassignedMembers ?? unassignedMembers.length}</strong>
          <small>순 배정 필요</small>
        </article>
        <article className="metric-card">
          <span>배정 완료</span>
          <strong>{groupStats?.assignedMembers ?? assignedMembers.length}</strong>
          <small>리더 {groupStats?.assignedLeaderCount ?? assignedLeaderCount}/{groups.length}명 배정</small>
        </article>
      </div>

      <DisclosurePanel
        id="group-create"
        title="순 추가"
        meta={canManageGroups ? "이름과 리더를 지정" : "관리자 권한 필요"}
      >
        <form action={createGroupAction} className="member-form group-create-form">
          <label>
            순 이름
            <input name="name" required placeholder="예: 은미 순" disabled={!canManageGroups} />
          </label>
          <label>
            리더
            <select name="leaderMemberId" disabled={!canManageGroups}>
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
            <button className="primary-button" type="submit" disabled={!canManageGroups || isCreatingGroup}>
              추가
            </button>
          </div>
        </form>
      </DisclosurePanel>

      <section className="group-grid" id="group-list">
        {groups.map((group) => {
          const groupMembers = activeMembers.filter((member) => member.groupId === group.id);
          const visibleGroupStats = groupStats?.groups.find((item) => item.id === group.id);
          const careCount = groupMembers.filter(
            (member) =>
              member.status === "care" ||
              member.careFollowups.some((followup) => followup.status !== "resolved"),
          ).length;
          return (
            <article className="group-card" key={group.id}>
              <header>
                <div>
                  <h2>{group.name}</h2>
                  <p className="meta">리더 {group.leaderName}</p>
                </div>
                <span className="role-pill">{visibleGroupStats?.memberCount ?? groupMembers.length}명</span>
              </header>
              <div className="group-card-overview">
                <div>
                  <strong>{visibleGroupStats?.memberCount ?? groupMembers.length}</strong>
                  <span>멤버</span>
                </div>
                <div>
                  <strong>{visibleGroupStats?.careCount ?? careCount}</strong>
                  <span>돌봄</span>
                </div>
              </div>
              <button className="secondary-button group-members-button" type="button" onClick={() => setGroupMembersModal(group)}>
                멤버 보기
              </button>
              <form
                action={updateGroupAction}
                className="management-form group-edit-form"
                onSubmit={() => setLastUpdatedGroupId(group.id)}
              >
                <input name="id" type="hidden" value={group.id} />
                <label>
                  이름
                  <input name="name" required defaultValue={group.name} disabled={!canManageGroups} />
                </label>
                <label>
                  리더
                  <select name="leaderMemberId" defaultValue={group.leaderMemberId ?? ""} disabled={!canManageGroups}>
                    <option value="">미배정</option>
                    {groupLeaderOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName} · {member.groupName}
                      </option>
                    ))}
                  </select>
                </label>
                {lastUpdatedGroupId === group.id ? <ActionMessage state={updateGroupState} /> : null}
                <button className="secondary-button" type="submit" disabled={!canManageGroups || isUpdatingGroup}>
                  저장
                </button>
              </form>
              <div className="group-delete-form">
                <button
                  className="danger-text-button"
                  type="button"
                  disabled={!canDeleteGroups || isDeletingGroup}
                  onClick={() => setGroupPendingDelete(group)}
                >
                  삭제
                </button>
              </div>
              {lastDeletedGroupId === group.id ? <ActionMessage state={deleteGroupState} /> : null}
            </article>
          );
        })}
      </section>
      {groupMembersModal ? (
        <GroupMembersModal
          group={groupMembersModal}
          members={activeMembers.filter((member) => member.groupId === groupMembersModal.id)}
          onClose={() => setGroupMembersModal(null)}
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
      {unassignedMembers.length > 0 ? (
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
  const [localMembers, setLocalMembers] = useState(members);
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
  const [createEventState, createEventAction, isCreatingEvent] = useActionState(createAttendanceEvent, initialActionState);
  const [deleteEventState, deleteEventAction, isDeletingEvent] = useActionState(deleteAttendanceEvent, initialActionState);
  const [isPending, startTransition] = useTransition();
  const canManageAttendance = hasPermission(user.role, "attendance:write");
  const canDeleteAttendanceEvents = canUseDeleteActions(user.role);
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState("");
  const [attendanceGroupId, setAttendanceGroupId] = useState("all");
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [statsEventTypeFilter, setStatsEventTypeFilter] = useState("all");
  const [statsDateFilter, setStatsDateFilter] = useState("all");
  const [statsGroupId, setStatsGroupId] = useState("all");
  const [absenceMinimumStreak, setAbsenceMinimumStreak] = useState(3);
  const [eventPendingDelete, setEventPendingDelete] = useState<AttendanceEvent | null>(null);
  const [readAttendanceEventIds, setReadAttendanceEventIds] = useState<Set<string>>(new Set());
  const readEventsStorageKey = `newavely:read-attendance-events:${user.id}`;
  const hasExplicitAttendanceSelection = Boolean(explicitAttendanceEventId);

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
  const currentDateHasUnread = sameDateEvents.some((event) => unreadAttendanceEventIds.has(event.id));
  const attendanceStats = globalStats?.attendance;

  const activeMembers = localMembers.filter(isAttendanceRosterMember);
  const activeMemberCount = activeMembers.length;
  const currentPresentCount = activeMembers.filter((member) => member.present).length;
  const currentExcusedCount = activeMembers.filter((member) => getMemberAttendanceStatus(member, attendanceEventId) === "excused").length;
  const currentAbsentCount = Math.max(activeMemberCount - currentPresentCount - currentExcusedCount, 0);
  const currentAttendanceRate = activeMemberCount ? Math.round((currentPresentCount / activeMemberCount) * 100) : 0;
  const groupAttendanceStats = groups.map((group) => {
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
    ...groups.map((group) => {
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
  const absenceWatchList = activeMembers
    .map((member) => {
      let streak = 0;
      const scopedEvents = attendanceEvents
        .filter((event) => statsEventTypeFilter === "all" || event.title === statsEventTypeFilter)
        .filter((event) => statsDateFilter === "all" || event.eventDate === statsDateFilter)
        .slice(0, 10);
      for (const event of scopedEvents) {
        const record = member.attendanceHistory.find((item) => item.eventId === event.id);
        if (record?.status === "present" || record?.status === "excused") break;
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
    const matchesGroup = attendanceGroupId === "all" || member.groupId === attendanceGroupId;
    if (attendanceFilter === "present") return matchesQuery && matchesGroup && status === "present";
    if (attendanceFilter === "absent") return matchesQuery && matchesGroup && status === "absent";
    if (attendanceFilter === "excused") return matchesQuery && matchesGroup && status === "excused";
    return matchesQuery && matchesGroup;
  });

  return (
    <>
      <PageHeader eyebrow="출석 관리" title="출석" user={user} />
      <SectionNav
        items={[
          { href: "#attendance-stats", label: "통계" },
          { href: "#attendance-events", label: "이벤트" },
          { href: "#attendance-create", label: "새 이벤트" },
          ...(hasExplicitAttendanceSelection ? [{ href: "#attendance-checklist", label: "출석 체크" }] : []),
        ]}
      />
      <div className="attendance-page-flow">
      <section className="panel form-panel" id="attendance-events">
        <div className="panel-heading">
          <div>
            <h2>출석 날짜 선택</h2>
            <p className="meta">날짜를 고른 뒤 주일 예배와 순모임 출석을 따로 체크합니다.</p>
          </div>
          <span>{eventDateOptions.length}개 날짜</span>
        </div>
        {sameDateEvents.length > 1 ? (
          <div className="event-switcher" aria-label={`${attendanceDate} 이벤트 전환`}>
            <span>
              {currentDateHasUnread ? <span className="unread-event-dot" aria-label="새 이벤트" /> : null}
              {attendanceDate}
            </span>
            <div className="segmented">
              {sameDateEvents.map((event) => (
                <Link
                  className={`segment event-segment ${hasExplicitAttendanceSelection && event.id === attendanceEventId ? "active" : ""} ${
                    unreadAttendanceEventIds.has(event.id) ? "unread" : ""
                  }`}
                  href={`/attendance?eventId=${event.id}`}
                  key={event.id}
                >
                  {unreadAttendanceEventIds.has(event.id) ? <span className="unread-event-dot" aria-label="새 이벤트" /> : null}
                  {event.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        <div className="event-toolbar">
          <label>
            날짜 검색
            <input
              type="search"
              placeholder="날짜"
              value={eventSearchQuery}
              onChange={(event) => setEventSearchQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="event-selector-panel">
          <label>
            출석 날짜
            <select
              value={hasExplicitAttendanceSelection ? attendanceDate : ""}
              onChange={(event) => {
                const selectedDate = event.target.value;
                if (selectedDate) {
                  const eventForDate =
                    attendanceEvents.find((item) => item.eventDate === selectedDate && item.title === "주일 예배") ??
                    attendanceEvents.find((item) => item.eventDate === selectedDate);
                  if (eventForDate) {
                    window.location.href = `/attendance?eventId=${eventForDate.id}`;
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
          {hasExplicitAttendanceSelection && selectedAttendanceEvent ? (
            <div className="selected-event-summary">
              <div className="person-block">
                <strong>{selectedAttendanceEvent.eventDate}</strong>
                <span>{sameDateEvents.map((event) => event.title).join(" · ")}</span>
              </div>
              <button
                className="danger-text-button"
                type="button"
                disabled={!canManageAttendance || !canDeleteAttendanceEvents || isDeletingEvent}
                onClick={() => setEventPendingDelete(selectedAttendanceEvent)}
              >
                삭제
              </button>
            </div>
          ) : null}
          {attendanceEvents.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>아직 출석 이벤트가 없습니다</strong>
                <span>새 출석 이벤트를 만들면 멤버별 출석을 체크할 수 있습니다.</span>
              </div>
            </article>
          ) : null}
          {attendanceEvents.length > 0 && filteredEventDateOptions.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>조건에 맞는 날짜가 없습니다</strong>
                <span>검색어를 조정해보세요.</span>
              </div>
            </article>
          ) : null}
        </div>
        <ActionMessage state={deleteEventState} />
      </section>
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
              <h2 id="attendance-event-delete-title">출석 이벤트를 지울까요?</h2>
              <p>
                <strong>{eventPendingDelete.eventDate} · {eventPendingDelete.title}</strong> 이벤트를 삭제하면 연결된 멤버별
                출석 기록도 함께 삭제됩니다.
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

      <DisclosurePanel
        id="attendance-stats"
        title="출석 통계"
        meta={`${hasExplicitAttendanceSelection ? attendanceTitle : "최근 이벤트 기준"} · 출석률 ${displayCurrentAttendanceRate}%`}
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
                {groups.map((group) => (
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

      {hasExplicitAttendanceSelection ? (
      <section className="panel" id="attendance-checklist">
        <div className="attendance-check-header">
          <div>
            <h2>출석 체크</h2>
            <span>
              {attendanceDate} · {attendanceTitle} · {attendanceMembers.length}/{activeMemberCount}명 표시
            </span>
          </div>
          <div className="attendance-check-controls">
            {sameDateEvents.length > 1 ? (
              <div className="attendance-mode-switcher" aria-label="출석 종류 선택">
                <span>출석 종류</span>
                <div className="segmented">
                  {sameDateEvents.map((event) => (
                    <Link
                      className={`segment event-segment ${event.id === attendanceEventId ? "active" : ""}`}
                      href={`/attendance?eventId=${event.id}`}
                      key={event.id}
                    >
                      {event.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
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
        </div>
        <div className="attendance-toolbar">
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
            순
            <select onChange={(event) => setAttendanceGroupId(event.target.value)} value={attendanceGroupId}>
              <option value="all">전체 순</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
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
                onToggleEvent={(event, nextPresent) => {
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
                }}
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
      </section>
      ) : (
        <section className="panel attendance-selection-empty" id="attendance-checklist">
          <div className="person-block">
            <strong>출석 체크할 날짜를 선택해주세요</strong>
            <span>날짜를 고른 뒤 주일 예배 또는 순모임 출석을 체크할 수 있습니다.</span>
          </div>
        </section>
      )}
      </div>
    </>
  );
}

function GroupMembersModal({
  group,
  members,
  onClose,
}: {
  group: Group;
  members: Member[];
  onClose: () => void;
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

  return (
    <article className={`attendance-row attendance-card ${status}`}>
      <div className="person-block">
        <strong>{member.displayName}</strong>
        <span>{member.groupName}</span>
        {visibleNotes.length > 0 ? <span>사유: {visibleNotes.join(" · ")}</span> : null}
      </div>
      <span className={`attendance-pill ${status}`}>{attendanceStatusLabels[status]}</span>
      <div className="attendance-actions attendance-type-actions">
        {visibleAttendanceEvents.map((event) => {
          const eventStatus = getMemberAttendanceStatus(member, event.id);
          const currentRecord = member.attendanceHistory.find((record) => record.eventId === event.id);
          const visibleNote = currentRecord?.note && !isImportedAttendanceNote(currentRecord.note) ? currentRecord.note : "";
          return (
            <div className={`attendance-type-action ${eventStatus}`} key={event.id}>
              <div className="attendance-type-action-heading">
                <strong>{event.title}</strong>
                <span className={`attendance-pill ${eventStatus}`}>{attendanceStatusLabels[eventStatus]}</span>
              </div>
              <button
                className={eventStatus === "present" ? "secondary-button" : "primary-button"}
                disabled={!canManageAttendance || isPending}
                onClick={() => onToggleEvent(event, eventStatus !== "present")}
                type="button"
              >
                {eventStatus === "present" ? "미출석 처리" : "출석 체크"}
              </button>
              <details className="reason-details">
                <summary>사유</summary>
                <form action={reasonAction} className="reason-form">
                  <input name="memberId" type="hidden" value={member.id} />
                  <input name="eventId" type="hidden" value={event.id} />
                  <label>
                    시작일
                    <input
                      name="excuseStartDate"
                      type="date"
                      defaultValue={currentRecord?.excuseStartDate || attendanceDate}
                      disabled={!canManageAttendance}
                    />
                  </label>
                  <label>
                    종료일
                    <input
                      name="excuseEndDate"
                      type="date"
                      defaultValue={currentRecord?.excuseEndDate || attendanceDate}
                      disabled={!canManageAttendance}
                    />
                  </label>
                  <label className="full-width">
                    사유
                    <textarea
                      name="note"
                      placeholder="여행, 건강, 가정 일정 등"
                      defaultValue={visibleNote}
                      disabled={!canManageAttendance}
                    />
                  </label>
                  <div className="form-actions full-width">
                    <ActionMessage state={reasonState} />
                    <button className="secondary-button" type="submit" disabled={!canManageAttendance || isSavingReason}>
                      저장
                    </button>
                  </div>
                </form>
              </details>
            </div>
          );
        })}
      </div>
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
  return (member.status === "active" || member.status === "care") && !isMergedPlaceholderMember(member);
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

export function PermissionsPageContent({ user, members, groups, memberLinkRequests = [], deletedAuthUsers = [] }: AppDataProps) {
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [roleState, roleAction, isUpdatingRole] = useActionState(updateMemberRole, initialActionState);
  const [approveState, approveAction, isApprovingRequest] = useActionState(approveMemberLinkRequest, initialActionState);
  const [rejectState, rejectAction, isRejectingRequest] = useActionState(rejectMemberLinkRequest, initialActionState);
  const [reopenState, reopenAction, isReopeningRequest] = useActionState(reopenMemberLinkRequest, initialActionState);
  const [restoreState, restoreAction, isRestoringDeletedUser] = useActionState(restoreDeletedAuthUser, initialActionState);
  const canManageRoles = hasPermission(user.role, "roles:manage");
  const assignableRoleEntries = getAssignableRoleEntries(user.role);
  const pendingLinkRequests = memberLinkRequests.filter(isActionableLinkRequest);
  const rejectedLinkRequests = memberLinkRequests
    .filter((request) => request.status === "rejected" && request.requesterStatus !== "inactive")
    .slice(0, 10);
  const activeAdmins = members.filter((member) => member.role === "admin" && member.status !== "inactive");
  const ownerAndAdmins = members.filter(
    (member) => (member.role === "owner" || member.role === "admin") && member.status !== "inactive",
  );
  const visiblePermissionEntries = (Object.entries(permissionsByRole) as Array<[Role, (typeof permissionsByRole)[Role]]>).filter(
    ([role]) => role !== "owner",
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
          <strong>{activeAdmins.length}</strong>
          <small>운영 관리자</small>
        </article>
        <article className="metric-card">
          <span>리더/순장</span>
          <strong>{members.filter((member) => member.role === "leader" || member.role === "staff").length}</strong>
          <small>운영 권한 보유</small>
        </article>
        <article className="metric-card">
          <span>멤버 기본 권한</span>
          <strong>{permissionsByRole.member.length}</strong>
          <small>읽기 중심 접근</small>
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
            const roleMembers = visibleRoleMembers.filter((member) => member.role === role).sort((a, b) => a.name.localeCompare(b.name));
            return (
              <article className="permission-row" key={role} tabIndex={0}>
                <div className="person-block permission-role-summary">
                  <strong>{roleLabels[role]}</strong>
                  <span>{roleMembers.length}명 배정</span>
                  <div className="role-member-overlay" role="tooltip">
                    <div className="role-member-overlay-heading">
                      <strong>{roleLabels[role]} 멤버</strong>
                      <span>{roleMembers.length}명</span>
                    </div>
                    <div className="role-member-overlay-list">
                      {roleMembers.slice(0, 12).map((member) => (
                        <span className="role-member-overlay-item" key={member.id}>
                          <strong>{member.displayName}</strong>
                          <small>{member.groupName}</small>
                        </span>
                      ))}
                      {roleMembers.length > 12 ? <span className="role-member-overlay-more">+{roleMembers.length - 12}명 더 있음</span> : null}
                      {roleMembers.length === 0 ? <span className="role-member-overlay-empty">배정된 멤버가 없습니다</span> : null}
                    </div>
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
                      <span>연결 대상 · {request.targetEmail || (request.targetMemberId ? "이메일 없음" : "관리자가 선택 필요")}</span>
                    </div>
                    <strong>{request.targetName}</strong>
                  </div>
                  {!request.targetMemberId ? (
                    <div className="link-request-resolution">
                      <label>
                        처리 방식
                        <select name="createTargetMode" form={`approve-link-request-${request.id}`} disabled={!canManageRoles}>
                          <option value="existing">기존 교적에 연결</option>
                          <option value="new">새 교적 생성 후 연결</option>
                        </select>
                      </label>
                      <label>
                        기존 교적 멤버
                        <select name="targetMemberId" form={`approve-link-request-${request.id}`} disabled={!canManageRoles}>
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
                      </div>
                    </div>
                  ) : null}
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
          {filteredRoleManagedMembers.map((member) => (
            <form action={roleAction} className="role-management-row" key={member.id}>
              <input name="id" type="hidden" value={member.id} />
              <div className="person-block">
                <strong>{member.displayName}</strong>
                <span>
                  {member.groupName} · {member.email || "이메일 없음"} · {member.authUserId ? "Google 연결" : "미연결"}
                </span>
              </div>
              <select name="role" defaultValue={member.role} disabled={!canManageRoles}>
                {assignableRoleEntries.map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
              <button className="secondary-button" type="submit" disabled={!canManageRoles || isUpdatingRole}>
                변경
              </button>
            </form>
          ))}
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
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="meta">
          {user.name} · {roleLabels[user.role]} 권한
        </p>
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
  member: "멤버",
};

const roleOrder: Record<Role, number> = {
  owner: 0,
  admin: 1,
  leader: 2,
  staff: 3,
  member: 4,
};

function getAssignableRoleEntries(actorRole: Role): Array<[Role, string]> {
  return (Object.entries(roleLabels) as Array<[Role, string]>).filter(([role]) => actorRole === "owner" || role !== "owner");
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
  "groups:read": "순 보기",
  "groups:write": "순 수정",
  "roles:manage": "권한 관리",
  "owner:manage": "최고 관리자 관리",
  "sensitive:read": "민감 정보 열람",
  "links:read": "링크 보기",
  "links:write": "링크 추가",
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
