import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const staleLinkCleanupSource = readFileSync(new URL("../db/009_cleanup_stale_member_link_requests.sql", import.meta.url), "utf8");
const memberDeletePolicySource = readFileSync(new URL("../db/010_admin_member_delete_policy.sql", import.meta.url), "utf8");
const memberLinkAdminPolicySource = readFileSync(new URL("../db/011_member_link_request_admin_policy.sql", import.meta.url), "utf8");
const ownerRoleMigrationSource = readFileSync(new URL("../db/012_owner_role.sql", import.meta.url), "utf8");
const ownerRolePoliciesSource = readFileSync(new URL("../db/013_owner_role_policies.sql", import.meta.url), "utf8");
const deleteRolePoliciesSource = readFileSync(new URL("../db/014_delete_role_policies.sql", import.meta.url), "utf8");
const attendanceObservabilitySource = readFileSync(
  new URL("../db/015_attendance_observability.sql", import.meta.url),
  "utf8",
);
const attendanceImportNotesCleanupSource = readFileSync(
  new URL("../db/016_clear_attendance_import_notes.sql", import.meta.url),
  "utf8",
);
const memberEnglishNamesSource = readFileSync(new URL("../db/017_member_english_names.sql", import.meta.url), "utf8");
const deletedAuthUserBlocksSource = readFileSync(new URL("../db/018_deleted_auth_user_blocks.sql", import.meta.url), "utf8");
const deletedAuthRestoreRequestsSource = readFileSync(new URL("../db/019_deleted_auth_restore_requests.sql", import.meta.url), "utf8");
const importantLinksSource = readFileSync(new URL("../db/021_important_links.sql", import.meta.url), "utf8");
const memberStatusMessagesSource = readFileSync(new URL("../db/022_member_status_messages.sql", import.meta.url), "utf8");
const staffLeaderParitySource = readFileSync(new URL("../db/023_staff_leader_parity.sql", import.meta.url), "utf8");
const adminFeedbackMessagesSource = readFileSync(new URL("../db/024_admin_feedback_messages.sql", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const appPageDataSource = readFileSync(new URL("../src/lib/app-page-data.ts", import.meta.url), "utf8");
const globalCssSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const appGateSource = readFileSync(new URL("../src/components/app-page-gate.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
const feedbackPageSource = readFileSync(new URL("../src/app/feedback/page.tsx", import.meta.url), "utf8");
const googleSheetsSource = readFileSync(new URL("../src/lib/google-sheets.ts", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const memberDetailSource = readFileSync(new URL("../src/components/member-detail.tsx", import.meta.url), "utf8");
const memberStatusComposerSource = readFileSync(
  new URL("../src/components/member-status-composer.tsx", import.meta.url),
  "utf8",
);
const onboardingSource = readFileSync(new URL("../src/components/onboarding-panel.tsx", import.meta.url), "utf8");
const profilePageSource = readFileSync(new URL("../src/app/profile/page.tsx", import.meta.url), "utf8");
const sectionNavSource = readFileSync(new URL("../src/components/section-nav.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const mobileAwareNavSource = readFileSync(new URL("../src/components/mobile-aware-nav.tsx", import.meta.url), "utf8");

test("dashboard member query disambiguates group and attendance embeds", () => {
  assert.match(dataSource, /id, auth_user_id, name/);
  assert.match(dataSource, /groups!members_group_id_fkey\(name\)/);
  assert.match(
    dataSource,
    /attendance_records!attendance_records_member_id_fkey\(event_id, status, note, excuse_start_date, excuse_end_date, attendance_events\(event_date, title\)\)/,
  );
  assert.match(dataSource, /care_followups!care_followups_member_id_fkey\(/);
  assert.match(dataSource, /assigned_to:members!care_followups_assigned_to_member_id_fkey\(name\)/);
});

test("dashboard queries do not use known ambiguous embeds", () => {
  assert.doesNotMatch(dataSource, /[^!]groups\(name\)/);
  assert.doesNotMatch(dataSource, /[^!]attendance_records\(/);
  assert.doesNotMatch(dataSource, /[^!]care_followups\(/);
});

test("group leader query uses the explicit leader relationship", () => {
  assert.match(dataSource, /leader:members!groups_leader_member_id_fkey\(name\)/);
  assert.match(dataSource, /leader_member_id/);
});

test("schema includes member link request workflow", () => {
  assert.match(schemaSource, /create table member_link_requests/);
  assert.match(schemaSource, /member_link_requests_one_pending_per_requester_idx/);
  assert.match(schemaSource, /users can create their own link requests/);
  assert.match(dataSource, /member_link_requests/);
});

test("first-login onboarding does not auto-link or auto-admin new Google users", () => {
  assert.doesNotMatch(dataSource, /\.update\(\{ auth_user_id: user\.id, role \}\)/);
  assert.match(dataSource, /status: "new"/);
  assert.match(dataSource, /needsOnboarding: true/);
  assert.match(onboardingSource, /본인 교적을 연결해주세요/);
  assert.match(onboardingSource, /검색이 어렵거나 교적이 안 보이나요/);
  assert.match(onboardingSource, /검색 결과가 없습니다/);
  assert.match(globalCssSource, /position: sticky;[\s\S]*bottom: 12px/);
});

test("schema allows admin-routed link requests while tightening member reads", () => {
  assert.match(schemaSource, /target_member_id uuid references members/);
  assert.match(schemaSource, /current_member_id\(\)/);
  assert.match(schemaSource, /current_member_status\(\) = 'new'/);
  assert.match(schemaSource, /auth_user_id is null/);
  assert.match(schemaSource, /users can create their own pending member profile/);
  assert.match(schemaSource, /and role = 'member'/);
  assert.match(schemaSource, /and status = 'new'/);
  assert.match(schemaSource, /authorized users can read attendance records/);
});

test("admins get a visible pending link request notification", () => {
  assert.match(appGateSource, /AdminNotificationBar/);
  assert.match(appGateSource, /pendingLinkRequests\.length/);
  assert.match(appGateSource, /isActionableLinkRequest/);
  assert.match(appGateSource, /\/permissions#link-requests/);
});

test("link request decisions support rejection and new member creation", () => {
  assert.match(actionsSource, /\.maybeSingle\(\)/);
  assert.match(actionsSource, /요청이 이미 정리되었습니다/);
  assert.match(actionsSource, /교적 연결 요청이 거절되었습니다/);
  assert.match(actionsSource, /member\.create_for_link_request/);
  assert.match(actionsSource, /member_link_request\.reopen/);
  assert.match(dashboardSource, /새 교적 생성 후 연결/);
  assert.match(dashboardSource, /거절된 요청 다시 검토/);
  assert.match(dashboardSource, /reopenMemberLinkRequest/);
  assert.match(memberDetailSource, /rejectedLinkRequest/);
  assert.match(memberLinkAdminPolicySource, /owners and admins can update link requests/);
});

test("member permanent delete follows role hierarchy and is audited", () => {
  assert.match(actionsSource, /deleteMemberPermanently/);
  assert.match(actionsSource, /restoreDeletedAuthUser/);
  assert.match(actionsSource, /requestDeletedAuthUserRestore/);
  assert.match(actionsSource, /member\.restore_deleted_auth_user/);
  assert.match(actionsSource, /getAuthorizedCurrentMember\("members:write"\)/);
  assert.match(actionsSource, /getAuthorizedCurrentMember\("roles:manage"\)/);
  assert.match(actionsSource, /canDeleteMemberRole/);
  assert.match(actionsSource, /member\.permanent_delete/);
  assert.match(actionsSource, /cascadingRecords/);
  assert.match(actionsSource, /closedPendingLinkRequests/);
  assert.match(actionsSource, /deleted_auth_users/);
  assert.match(actionsSource, /member\.auth_user_id/);
  assert.match(actionsSource, /deletedAuthBlockPayload/);
  assert.match(actionsSource, /deletedAuthUserError\.code !== "23505"/);
  assert.doesNotMatch(actionsSource, /\.from\("deleted_auth_users"\)\.upsert/);
  assert.match(actionsSource, /deletedCount !== 1/);
  assert.match(dataSource, /getDeletedAuthUserBlock/);
  assert.match(dataSource, /getDeletedAuthUsers/);
  assert.match(dataSource, /\.not\("restore_requested_at", "is", null\)/);
  assert.match(appPageDataSource, /deletedAuthUsers/);
  assert.match(dashboardSource, /삭제된 계정 복구/);
  assert.match(dashboardSource, /restoreDeletedAuthUser/);
  assert.match(dashboardSource, /restoreRequestedAt/);
  assert.match(dashboardSource, /restoreRequestNote/);
  assert.match(appGateSource, /allowRestoreRequest=\{isDeletedAccountError\}/);
  assert.match(appGateSource, /isDeletedAccountError/);
  assert.match(appGateSource, /로그인할 수 없는 계정입니다/);
  assert.match(dashboardSource, /복구/);
  assert.match(dataSource, /이전에 삭제된 멤버 계정/);
  assert.match(dataSource, /다시 활성화가 필요하면 Newavely 운영 관리자에게 연락해주세요/);
  assert.match(dataSource, /현재 비활성화되어 로그인할 수 없습니다/);
  assert.match(appGateSource, /로그인할 수 없는 계정입니다/);
  assert.match(appGateSource, /계정 확인 필요/);
  assert.match(schemaSource, /create table deleted_auth_users/);
  assert.match(schemaSource, /authorized users can delete lower role members/);
  assert.match(deleteRolePoliciesSource, /authorized users can delete lower role members/);
  assert.match(deleteRolePoliciesSource, /leaders can delete groups/);
  assert.match(staffLeaderParitySource, /current_member_role\(\) in \('owner', 'admin', 'leader', 'staff'\)/);
  assert.match(staffLeaderParitySource, /when 'staff' then 3/);
  assert.match(deletedAuthUserBlocksSource, /member\.permanent_delete\.backfill/);
  assert.match(deletedAuthUserBlocksSource, /deleted_auth_users/);
  assert.match(deletedAuthRestoreRequestsSource, /restore_requested_at/);
  assert.match(deletedAuthRestoreRequestsSource, /deleted auth users can request restore/);
  assert.match(memberDeletePolicySource, /owners can delete members/);
  assert.match(dashboardSource, /완전 삭제/);
});

test("schema supports owner role above admin", () => {
  assert.match(schemaSource, /create type member_role as enum \('owner', 'admin', 'leader', 'staff', 'member'\)/);
  assert.match(actionsSource, /owner:manage/);
  assert.match(dashboardSource, /최고 관리자/);
  assert.match(ownerRoleMigrationSource, /alter type member_role add value if not exists 'owner'/);
  assert.match(ownerRolePoliciesSource, /set role = 'owner'/);
});

test("stale member link request cleanup closes orphaned pending requests", () => {
  assert.match(staleLinkCleanupSource, /update member_link_requests/);
  assert.match(staleLinkCleanupSource, /status = 'rejected'/);
  assert.match(staleLinkCleanupSource, /not exists/);
});

test("pages expose section navigation anchors for operator workflows", () => {
  assert.match(sectionNavSource, /aria-label="페이지 섹션"/);
  assert.doesNotMatch(sectionNavSource, /section-nav-label/);
  assert.doesNotMatch(sectionNavSource, /빠른 이동/);
  assert.match(sectionNavSource, /section-nav-links/);
  assert.match(dashboardSource, /#member-list/);
  assert.match(dashboardSource, /#attendance-checklist/);
  assert.match(dashboardSource, /#link-requests/);
  assert.match(memberDetailSource, /#basic-info/);
  assert.match(memberDetailSource, /#care-followups/);
});

test("dashboard exposes roster insight sections for operators", () => {
  assert.match(dashboardSource, /buildDashboardInsights/);
  assert.match(dashboardSource, /교적부 통계 요약/);
  assert.match(dashboardSource, /StatisticsBarCard/);
  assert.match(dashboardSource, /buildStatisticsSummary/);
  assert.match(dashboardSource, /upcomingBirthdays/);
  assert.match(dashboardSource, /이번달/);
  assert.match(dashboardSource, /다음달/);
  assert.match(dashboardSource, /월별 생일자/);
  assert.match(dashboardSource, /순 배정표/);
  assert.match(dashboardSource, /사역자 구성 현황/);
  assert.match(dashboardSource, /직업 분포/);
  assert.match(dashboardSource, /연령대 분포/);
  assert.match(dashboardSource, /buildBirthdayMonths/);
  assert.match(dashboardSource, /buildGroupRosters/);
  assert.match(dashboardSource, /buildMinistryRosters/);
  assert.match(dashboardSource, /buildJobDistribution/);
  assert.match(dashboardSource, /buildAgeDistribution/);
  assert.match(dashboardSource, /최근 예배/);
  assert.match(dashboardSource, /평균 예배/);
  assert.match(dashboardSource, /최근 순모임/);
  assert.match(dashboardSource, /평균 순모임/);
  assert.match(dashboardSource, /buildDashboardGroupAttendanceRates/);
  assert.match(globalCssSource, /dashboard-insights/);
  assert.match(globalCssSource, /statistics-panel/);
  assert.match(globalCssSource, /upcoming-birthday-grid/);
  assert.match(globalCssSource, /mini-roster-card/);
  assert.match(globalCssSource, /group-attendance-metrics/);
});

test("attendance check screen summarizes selected group worship and group attendance", () => {
  assert.match(dashboardSource, /내 순 출석현황/);
  assert.match(dashboardSource, /attendanceOverviewRows/);
  assert.match(dashboardSource, /shouldShowAttendanceOverview/);
  assert.match(dashboardSource, /attendanceGroupId !== "all" && attendanceGroupId !== "unassigned"/);
  assert.match(dashboardSource, /fullyPresentCount/);
  assert.match(dashboardSource, /needsCheckCount/);
  assert.match(dashboardSource, /attendanceGroupId === "unassigned" \? !member\.groupId : member\.groupId === attendanceGroupId/);
  assert.match(dashboardSource, /<option value="unassigned">미배정<\/option>/);
  assert.match(globalCssSource, /group-attendance-snapshot/);
  assert.match(globalCssSource, /snapshot-mini-metrics/);
  assert.match(globalCssSource, /snapshot-status\.present/);
});

test("dashboard metric cards use role-independent server metrics", () => {
  assert.match(appPageDataSource, /export function buildDashboardMetrics/);
  assert.match(appPageDataSource, /export function buildGlobalAppStats/);
  assert.match(appPageDataSource, /globalStats = buildGlobalAppStats\(/);
  assert.match(homePageSource, /dashboardMetrics=\{readyData\.dashboardMetrics\}/);
  assert.match(homePageSource, /globalStats=\{readyData\.globalStats\}/);
  assert.match(dashboardSource, /dashboardMetrics\?: DashboardMetrics/);
  assert.match(dashboardSource, /globalStats\?: GlobalAppStats/);
  assert.match(dashboardSource, /const metrics = dashboardMetrics \?\?/);
  assert.match(dashboardSource, /globalStats\?\.statisticsSummary/);
  assert.match(dashboardSource, /globalStats\?\.groupAttendanceSummary/);
  assert.match(dashboardSource, /metrics\.totalMembers/);
  assert.match(dashboardSource, /metrics\.attendanceEligibleMembers/);
});

test("common aggregate stats use unscoped server data while pages receive scoped members", () => {
  assert.match(appPageDataSource, /const scopedMembers = scopeMembersForRole/);
  assert.match(appPageDataSource, /members: scopedMembers/);
  assert.match(appPageDataSource, /globalStats,/);
  assert.match(appPageDataSource, /statisticsSummary: buildStatisticsSummary\(activeMembers\)/);
  assert.match(appPageDataSource, /groupPage: buildGroupPageStats\(activeMembers, groups\)/);
  assert.match(appPageDataSource, /attendance: \{/);
  assert.match(dashboardSource, /globalStats\?\.groupPage/);
  assert.match(dashboardSource, /globalStats\?\.attendance/);
  assert.match(dashboardSource, /displayCurrentAttendanceRate/);
  assert.match(dashboardSource, /displayAggregateGroupStats/);
});

test("mobile navigation collapses into an expandable dropdown", () => {
  assert.match(layoutSource, /<div className="sidebar-menu">/);
  assert.match(layoutSource, /className="mobile-menu-control"[\s\S]*type="checkbox"/);
  assert.match(layoutSource, /<label className="mobile-menu-toggle" htmlFor="mobile-menu-control">/);
  assert.match(layoutSource, /<MobileAwareNav \/>/);
  assert.match(mobileAwareNavSource, /"use client"/);
  assert.match(mobileAwareNavSource, /function closeMobileMenu/);
  assert.match(mobileAwareNavSource, /control\.checked = false/);
  assert.match(mobileAwareNavSource, /onClick=\{closeMobileMenu\}/);
  assert.match(globalCssSource, /@media \(max-width: 760px\)[\s\S]*\.mobile-menu-control:not\(:checked\) ~ \.nav-list/);
  assert.match(globalCssSource, /\.mobile-menu-control:checked ~ \.nav-list[\s\S]*mobileMenuReveal/);
});

test("global styles include sharper control radius pass", () => {
  assert.match(globalCssSource, /Sharper UI pass/);
  assert.match(globalCssSource, /\.primary-button,[\s\S]*\.event-chip \{[\s\S]*border-radius: 4px/);
  assert.match(globalCssSource, /\.status-pill,[\s\S]*\.permission-chip,[\s\S]*\.progress span \{[\s\S]*border-radius: 4px/);
  assert.match(globalCssSource, /\.topbar-actions \{[\s\S]*align-items: center/);
  assert.match(globalCssSource, /\.panel-heading \{[\s\S]*align-items: flex-start/);
  assert.match(globalCssSource, /\.section-nav-links \{[\s\S]*align-items: center/);
  assert.match(globalCssSource, /\.attendance-card \{[\s\S]*minmax\(88px, auto\)/);
  assert.doesNotMatch(globalCssSource, /\.topbar-actions \{[\s\S]{0,120}align-items: end/);
});

test("member detail opens as a centered modal from the roster", () => {
  assert.match(dashboardSource, /member-list-layout/);
  assert.match(dashboardSource, /member-list-table/);
  assert.match(dashboardSource, /member-detail-backdrop/);
  assert.match(dashboardSource, /member-detail-modal/);
  assert.match(dashboardSource, /role=\{selectedMember \? "dialog" : undefined\}/);
  assert.match(dashboardSource, /member-detail-actions/);
  assert.match(dashboardSource, /member-delete-zone/);
  assert.match(dashboardSource, /member-delete-actions/);
  assert.match(dashboardSource, /setSelectedMemberId\(""\)/);
  assert.match(dashboardSource, /memberDetailMessageMemberId/);
  assert.match(dashboardSource, /setMemberDetailMessageMemberId\(null\)/);
  assert.match(dashboardSource, /memberDetailMessageMemberId === selectedMember\.id/);
  assert.match(dashboardSource, /selected-row/);
});

test("attendance checklist uses roster members and exposes search filters", () => {
  assert.doesNotMatch(dataSource, /\.limit\(12\)/);
  assert.match(dataSource, /\.order\("event_date", \{ ascending: false \}\)[\s\S]*\.order\("title", \{ ascending: true \}\)/);
  assert.match(dashboardSource, /isAttendanceRosterMember/);
  assert.match(dashboardSource, /member\.status === "active" \|\| member\.status === "care"/);
  assert.match(dashboardSource, /!isMergedPlaceholderMember\(member\)/);
  assert.match(dashboardSource, /attendanceSearchQuery/);
  assert.match(dashboardSource, /attendanceGroupId/);
  assert.match(dashboardSource, /requestedAttendanceGroupId/);
  assert.match(dashboardSource, /buildAttendanceHref/);
  assert.match(dashboardSource, /eventSearchQuery/);
  assert.match(dashboardSource, /eventDateOptions/);
  assert.match(dashboardSource, /filteredEventDateOptions/);
  assert.match(dashboardSource, /useSearchParams/);
  assert.match(dashboardSource, /hasExplicitAttendanceSelection/);
  assert.match(dashboardSource, /readAttendanceEventIds/);
  assert.match(dashboardSource, /window\.localStorage\.setItem\(readEventsStorageKey/);
  assert.match(dashboardSource, /unreadAttendanceEventIds/);
  assert.match(dashboardSource, /unread-event-dot/);
  assert.match(dashboardSource, /id="attendance-stats"/);
  assert.doesNotMatch(dashboardSource, /defaultOpen[\s\S]*id="attendance-stats"/);
  assert.match(globalCssSource, /attendance-page-flow/);
  assert.match(globalCssSource, /\.attendance-page-flow #attendance-stats/);
  assert.match(appPageDataSource, /eventGroupTrend/);
  assert.match(dashboardSource, /absenceMinimumStreak/);
  assert.match(dashboardSource, /compactTrendRows/);
  assert.match(dashboardSource, /attendance-trend-chart/);
  assert.match(dashboardSource, /attendance-hover-card/);
  assert.match(dashboardSource, /attendance-compare-row/);
  assert.match(dashboardSource, /onClick=\{\(\) => setStatsGroupId\(group\.id\)\}/);
  assert.match(globalCssSource, /attendance-kpi-strip/);
  assert.match(globalCssSource, /attendance-insight-grid/);
  assert.match(globalCssSource, /attendance-trend-track:hover \.attendance-hover-card/);
  assert.match(dashboardSource, /sameDateEvents/);
  assert.match(dashboardSource, /event-selector-panel/);
  assert.match(dashboardSource, /출석 날짜 선택/);
  assert.match(dashboardSource, /attendanceCheckEventNames/);
  assert.doesNotMatch(dashboardSource, /출석 종류/);
  assert.doesNotMatch(dashboardSource, /attendance-mode-switcher/);
  assert.doesNotMatch(globalCssSource, /attendance-mode-switcher/);
  assert.match(dashboardSource, /체크할 날짜 선택/);
  assert.match(dashboardSource, /주일 예배[\s\S]*순모임/);
  assert.match(dashboardSource, /event-create-note/);
  assert.match(dashboardSource, /선택한 날짜 안에 주일 예배와 순모임 출석 체크가 함께 만들어집니다/);
  assert.match(dashboardSource, /attendance-check-list/);
  assert.match(dashboardSource, /attendance-card/);
  assert.match(dashboardSource, /attendance-type-actions/);
  assert.match(dashboardSource, /attendance-type-action/);
  assert.match(dashboardSource, /onToggleEvent/);
  assert.match(dashboardSource, /getMemberAttendanceStatus\(member, event\.id\)/);
  assert.match(dashboardSource, /isImportedAttendanceNote/);
  assert.match(dashboardSource, /Imported from 2026 annual attendance CSV/);
  assert.match(actionsSource, /formData\.getAll\("titles"\)/);
  assert.match(actionsSource, /legacyTitle \? \[legacyTitle\] : \["주일 예배", "순모임"\]/);
  assert.match(actionsSource, /선택한 출석 이벤트가 이미 모두 있습니다/);
  assert.match(actionsSource, /export async function deleteAttendanceEvent/);
  assert.match(actionsSource, /attendance_event\.delete/);
  assert.match(actionsSource, /canUseDeleteActions\(currentMember\.role\)/);
  assert.match(dashboardSource, /eventPendingDelete/);
  assert.match(dashboardSource, /출석 이벤트를 지울까요/);
  assert.match(dashboardSource, /deleteEventAction/);
  assert.doesNotMatch(dashboardSource, /member\.groupName} · {member\.phone/);
});

test("dashboard gives leaders a mobile shortcut to their group attendance", () => {
  assert.match(dashboardSource, /mobile-attendance-shortcut/);
  assert.match(dashboardSource, /chooseAttendanceShortcutEvent/);
  assert.match(dashboardSource, /groupId=\$\{ownGroup\.id\}&mode=group#attendance-checklist/);
  assert.match(globalCssSource, /mobile-attendance-shortcut/);
});

test("attendance event setup supports batch creation and Sunday auto-create in Pacific time", () => {
  assert.match(dataSource, /timeZone: "America\/Los_Angeles"/);
  assert.match(dataSource, /autoCreateSundayWorship/);
  assert.match(dataSource, /today\.isSunday/);
  assert.match(dataSource, /for \(const title of \["주일 예배", "순모임"\]\)/);
  assert.match(appPageDataSource, /hasPermission\(currentMember\.role, "attendance:write"\)/);
  assert.match(appPageDataSource, /createdByMemberId: currentMember\.id/);
  assert.match(actionsSource, /titlesToCreate/);
  assert.match(actionsSource, /\.in\("title", parsed\.titles\)/);
  assert.match(actionsSource, /이미 있던 \$\{skippedCount\}개는 건너뛰었습니다/);
});

test("attendance stats can aggregate all events by group and event type", () => {
  assert.match(dashboardSource, /statsEventTypeFilter/);
  assert.match(dashboardSource, /statsDateFilter/);
  assert.match(dashboardSource, /statsGroupId/);
  assert.match(dashboardSource, /<option value="all">전체 날짜<\/option>/);
  assert.match(dashboardSource, /event\.eventDate === statsDateFilter/);
  assert.match(dashboardSource, /row\.eventDate !== statsDateFilter/);
  assert.match(dashboardSource, /buildAggregateAttendanceStat/);
  assert.match(dashboardSource, /날짜별 출석률/);
  assert.match(dashboardSource, /순별 비교/);
  assert.match(dashboardSource, /aggregateGroupStats/);
});

test("group management uses active member choices and supports audited delete", () => {
  assert.match(dashboardSource, /groupLeaderOptions/);
  assert.match(dashboardSource, /!isMergedPlaceholderMember\(member\)/);
  assert.match(actionsSource, /export async function deleteGroup/);
  assert.match(actionsSource, /action: "group.delete"/);
  assert.match(actionsSource, /assignLeaderToGroup/);
  assert.match(actionsSource, /group_id: groupId/);
  assert.match(dashboardSource, /groupPendingDelete/);
  assert.match(dashboardSource, /if \(deleteGroupState\.ok\)/);
  assert.match(dashboardSource, /setGroupPendingDelete\(null\)/);
  assert.match(dashboardSource, /정말 지우시겠습니까/);
  assert.match(dashboardSource, /danger-text-button/);
  assert.match(dashboardSource, /groupMembersModal/);
  assert.match(dashboardSource, /GroupMembersModal/);
  assert.match(dashboardSource, /멤버 보기/);
  assert.match(dashboardSource, /상세보기/);
  assert.match(dashboardSource, /group-card-overview/);
  assert.doesNotMatch(dashboardSource, /group-card-stats/);
  assert.doesNotMatch(dashboardSource, /확인을 위해 순 이름을 입력/);
  assert.doesNotMatch(actionsSource, /const deleteGroupSchema[\s\S]{0,120}confirmName/);
  assert.match(memberDetailSource, /!isMergedPlaceholderMember\(item\)/);
});

test("permissions page exposes member search for role management", () => {
  assert.match(dashboardSource, /roleSearchQuery/);
  assert.match(dashboardSource, /멤버 검색/);
  assert.match(dashboardSource, /filteredRoleManagedMembers/);
  assert.match(dashboardSource, /#permission-matrix[\s\S]*#admin-checks[\s\S]*#link-requests[\s\S]*#deleted-account-restore[\s\S]*#role-management/);
  assert.match(
    dashboardSource,
    /id="permission-matrix"[\s\S]*id="admin-checks"[\s\S]*id="link-requests"[\s\S]*id="deleted-account-restore"[\s\S]*id="role-management"/,
  );
  assert.match(dashboardSource, /visiblePermissionEntries/);
  assert.match(dashboardSource, /role !== "owner"/);
  assert.match(dashboardSource, /<h2>역할 기반 권한<\/h2>/);
  assert.match(dashboardSource, /visibleRoleMembers/);
  assert.match(dashboardSource, /roleMembers\.slice\(0, 12\)/);
  assert.match(dashboardSource, /className="role-member-overlay"/);
  assert.match(dashboardSource, /role="tooltip"/);
  assert.match(globalCssSource, /\.permission-row:hover \.role-member-overlay/);
  assert.match(globalCssSource, /\.permission-row:focus-within \.role-member-overlay/);
  assert.doesNotMatch(dashboardSource, /<DisclosurePanel id="permission-matrix"/);
  assert.match(dashboardSource, /link-request-section/);
  assert.match(dashboardSource, /request-count-pill/);
  assert.match(dashboardSource, /request-empty-state/);
});

test("legacy manual account merge entrypoint is not exposed", () => {
  assert.doesNotMatch(actionsSource, /export async function mergeMemberAccount/);
  assert.doesNotMatch(dashboardSource, /Google 계정 프로필 병합/);
  assert.doesNotMatch(dashboardSource, /권한에서 프로필 병합/);
});

test("member roster can be exported to Google Sheets without internal fields", () => {
  assert.match(actionsSource, /exportMembersToGoogleSheet/);
  assert.match(actionsSource, /getAuthorizedCurrentMember\("members:write"\)/);
  assert.match(actionsSource, /members\.export_google_sheet/);
  assert.match(actionsSource, /internalCustomFieldKeys/);
  assert.match(actionsSource, /is_sensitive/);
  assert.match(actionsSource, /spreadsheetUrl: result\.spreadsheetUrl/);
  assert.match(dashboardSource, /showSheetLinkModal/);
  assert.match(dashboardSource, /Google Sheet를 확인할까요/);
  assert.match(dashboardSource, /href=\{exportedSheetUrl\}/);
  assert.match(dashboardSource, /Google Sheet로 내보내기/);
  assert.match(googleSheetsSource, /GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  assert.match(googleSheetsSource, /GOOGLE_PRIVATE_KEY/);
  assert.match(googleSheetsSource, /GOOGLE_SHEET_ID/);
  assert.match(googleSheetsSource, /spreadsheetUrl: `https:\/\/docs\.google\.com\/spreadsheets\/d\/\$\{spreadsheetId\}\/edit`/);
  assert.match(googleSheetsSource, /:clear/);
});

test("profile link request panel only appears for the current onboarding member", () => {
  assert.match(profilePageSource, /showLinkRequest={member\.status === "new"}/);
  assert.match(memberDetailSource, /request\.requesterMemberId === member\.id/);
  assert.match(memberDetailSource, /currentMemberLinkRequests\.find\(isActionableLinkRequest\)/);
});

test("attendance observability migration exposes summary views", () => {
  assert.match(attendanceObservabilitySource, /attendance_events_date_title_idx/);
  assert.match(attendanceObservabilitySource, /attendance_records_status_idx/);
  assert.match(attendanceObservabilitySource, /create or replace view attendance_event_group_summary/);
  assert.match(attendanceObservabilitySource, /create or replace view attendance_monthly_summary/);
  assert.match(attendanceObservabilitySource, /create or replace view attendance_member_yearly_summary/);
  assert.match(attendanceObservabilitySource, /with \(security_invoker = true\)/);
  assert.match(attendanceObservabilitySource, /attendance_rate/);
});

test("attendance import marker notes can be cleaned from the database", () => {
  assert.match(attendanceImportNotesCleanupSource, /update attendance_records/);
  assert.match(attendanceImportNotesCleanupSource, /set note = null/);
  assert.match(attendanceImportNotesCleanupSource, /Imported from 2026 annual attendance CSV/);
});

test("member English names are stored separately and displayed consistently", () => {
  assert.match(memberEnglishNamesSource, /'english_name', '영어 이름'/);
  assert.match(memberEnglishNamesSource, /regexp_match\(name/);
  assert.match(memberEnglishNamesSource, /jsonb_build_object\('english_name'/);
  assert.match(dataSource, /formatMemberDisplayName/);
  assert.match(actionsSource, /splitCompositeMemberName/);
  assert.match(dashboardSource, /name="englishName"/);
  assert.match(memberDetailSource, /name="englishName"/);
});

test("important links page is backed by audited role-gated data", () => {
  assert.match(schemaSource, /create table important_links/);
  assert.match(dataSource, /important_links_created_by_member_id_fkey/);
  assert.match(importantLinksSource, /https:\/\/www\.ccsnewave\.org\//);
  assert.match(importantLinksSource, /https:\/\/linktr\.ee\/ccsnewave/);
  assert.match(importantLinksSource, /https:\/\/www\.youtube\.com\/@ccsnewave/);
  assert.match(importantLinksSource, /https:\/\/www\.instagram\.com\/ccsnewave\//);
  assert.match(importantLinksSource, /current_member_role\(\) in \('owner', 'admin', 'leader', 'staff'\)/);
  assert.match(importantLinksSource, /current_member_role\(\) in \('owner', 'admin'\)/);
  assert.match(dataSource, /export async function getImportantLinks/);
  assert.match(appPageDataSource, /importantLinks/);
  assert.match(dashboardSource, /export function LinksPageContent/);
  assert.match(dashboardSource, /createImportantLink/);
  assert.match(dashboardSource, /deleteImportantLink/);
  assert.match(actionsSource, /important_link\.create/);
  assert.match(actionsSource, /important_link\.delete/);
  assert.match(mobileAwareNavSource, /href: "\/links"/);
  assert.match(globalCssSource, /link-grid/);
});

test("member status messages are short self-managed dashboard updates", () => {
  assert.match(schemaSource, /create table member_status_messages/);
  assert.match(memberStatusMessagesSource, /char_length\(message\) <= 80/);
  assert.match(memberStatusMessagesSource, /member_id = current_member_id\(\)/);
  assert.match(dataSource, /export async function getMemberStatusMessages/);
  assert.match(dataSource, /member_status_messages/);
  assert.match(appPageDataSource, /memberStatusMessages/);
  assert.match(actionsSource, /export async function updateMyStatusMessage/);
  assert.match(actionsSource, /max\(80/);
  assert.match(homePageSource, /memberStatusMessages=\{readyData\.memberStatusMessages\}/);
  assert.match(dashboardSource, /MemberStatusBoard/);
  assert.match(dashboardSource, /오늘의 한마디/);
  assert.match(memberDetailSource, /MemberStatusComposer/);
  assert.match(appGateSource, /MemberStatusComposer/);
  assert.match(memberStatusComposerSource, /quickStatusMessages/);
  assert.match(memberStatusComposerSource, /textarea/);
  assert.match(memberStatusComposerSource, /비우기/);
  assert.match(globalCssSource, /member-status-board/);
  assert.match(globalCssSource, /status-composer-panel/);
  assert.match(globalCssSource, /status-quick-list/);
  assert.match(globalCssSource, /status-input-shell/);
});

test("admin feedback inbox lets users message admins and admins update status", () => {
  assert.match(schemaSource, /create table admin_feedback_messages/);
  assert.match(adminFeedbackMessagesSource, /users can create own feedback messages/);
  assert.match(adminFeedbackMessagesSource, /owners and admins can update feedback messages/);
  assert.match(dataSource, /export async function getAdminFeedbackMessages/);
  assert.match(appPageDataSource, /adminFeedbackMessages/);
  assert.match(actionsSource, /export async function createAdminFeedbackMessage/);
  assert.match(actionsSource, /export async function updateAdminFeedbackMessage/);
  assert.match(dashboardSource, /export function FeedbackPageContent/);
  assert.match(dashboardSource, /관리자에게 보내기/);
  assert.match(appGateSource, /피드백 접수함으로 이동/);
  assert.match(feedbackPageSource, /FeedbackPageContent/);
  assert.match(mobileAwareNavSource, /href: "\/feedback"/);
  assert.match(globalCssSource, /feedback-inbox-panel/);
});
