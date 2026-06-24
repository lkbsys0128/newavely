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
const publicDashboardDataSource = readFileSync(new URL("../db/026_public_dashboard_data.sql", import.meta.url), "utf8");
const newFamilyApplicantsSource = readFileSync(new URL("../db/027_new_family_applicants.sql", import.meta.url), "utf8");
const newFamilyStatusFlowSource = readFileSync(new URL("../db/028_new_family_status_flow.sql", import.meta.url), "utf8");
const newFamilyExpectedGroupSource = readFileSync(new URL("../db/029_new_family_expected_group.sql", import.meta.url), "utf8");
const welcomeTeamRoleSource = readFileSync(new URL("../db/030_welcome_team_role.sql", import.meta.url), "utf8");
const welcomeTeamNewFamilyPoliciesSource = readFileSync(
  new URL("../db/031_welcome_team_new_family_policies.sql", import.meta.url),
  "utf8",
);
const publicPermissionRoleCountsSource = readFileSync(new URL("../db/032_public_permission_role_counts.sql", import.meta.url), "utf8");
const testAccountStatsExclusionSource = readFileSync(
  new URL("../db/033_test_account_stats_exclusion.sql", import.meta.url),
  "utf8",
);
const attendanceExtraCountsSource = readFileSync(new URL("../db/034_attendance_extra_counts.sql", import.meta.url), "utf8");
const communityLeaderAttendanceRolesSource = readFileSync(
  new URL("../db/035_community_leader_attendance_roles.sql", import.meta.url),
  "utf8",
);
const publicDashboardCommunityLeaderRoleSource = readFileSync(
  new URL("../db/036_public_dashboard_community_leader_role.sql", import.meta.url),
  "utf8",
);
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
const newFamilyPageSource = readFileSync(new URL("../src/app/new-family/page.tsx", import.meta.url), "utf8");
const newFamilySyncSource = readFileSync(new URL("../src/lib/new-family-sync.ts", import.meta.url), "utf8");
const newFamilyCronSource = readFileSync(new URL("../src/app/api/cron/sync-new-family/route.ts", import.meta.url), "utf8");
const vercelConfigSource = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const mobileAwareNavSource = readFileSync(new URL("../src/components/mobile-aware-nav.tsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const uiEmojisSource = readFileSync(new URL("../src/lib/ui-emojis.ts", import.meta.url), "utf8");
const cronAttendanceRouteSource = readFileSync(
  new URL("../src/app/api/cron/ensure-sunday-attendance/route.ts", import.meta.url),
  "utf8",
);
const supabaseEnvSource = readFileSync(new URL("../src/lib/supabase/env.ts", import.meta.url), "utf8");

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
  assert.match(actionsSource, /parsed\.createTargetMode === "existing"/);
  assert.match(actionsSource, /target_member_id: targetMemberId/);
  assert.match(actionsSource, /이미 다른 Google 계정에 연결된 교적입니다/);
  assert.match(actionsSource, /member_link_request\.reopen/);
  assert.match(dashboardSource, /승인할 교적 멤버/);
  assert.match(dashboardSource, /defaultValue=\{request\.targetMemberId \?\? ""\}/);
  assert.match(dashboardSource, /승인 전에 올바른 교적으로 바꿀 수 있습니다/);
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
  assert.match(schemaSource, /create type member_role as enum \('owner', 'admin', 'leader', 'staff', 'welcome', 'member'\)/);
  assert.match(actionsSource, /owner:manage/);
  assert.match(dashboardSource, /최고 관리자/);
  assert.match(ownerRoleMigrationSource, /alter type member_role add value if not exists 'owner'/);
  assert.match(welcomeTeamRoleSource, /alter type member_role add value if not exists 'welcome'/);
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

test("app chrome uses compact emoji accents without replacing labels", () => {
  assert.match(uiEmojisSource, /getPageEmoji/);
  assert.match(uiEmojisSource, /getSectionEmoji/);
  assert.match(sectionNavSource, /section-nav-emoji/);
  assert.match(mobileAwareNavSource, /nav-emoji/);
  assert.match(dashboardSource, /page-title-emoji/);
  assert.match(memberDetailSource, /page-title-emoji/);
  assert.match(globalCssSource, /\.page-title-emoji/);
  assert.match(globalCssSource, /\.nav-emoji/);
  assert.match(globalCssSource, /\.section-nav-emoji/);
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
  assert.match(dashboardSource, /출석현황/);
  assert.match(dashboardSource, /attendanceOverviewRows/);
  assert.match(dashboardSource, /attendanceOverviewTitleOrder/);
  assert.match(dashboardSource, /function getAttendanceOverviewEvents/);
  assert.match(dashboardSource, /getAttendanceOverviewEvents\(sameDateEvents, selectedAttendanceEvent\?\.id\)/);
  assert.match(dashboardSource, /fullyPresentCount/);
  assert.match(dashboardSource, /needsCheckCount/);
  assert.match(dashboardSource, /attendanceGroupId === "unassigned" \? !member\.groupId : member\.groupId === attendanceGroupId/);
  assert.match(dashboardSource, /attendanceGroupOptions/);
  assert.match(dashboardSource, /attendance-group-strip/);
  assert.match(dashboardSource, /attendance-group-chip/);
  assert.match(dashboardSource, /const isWelcomeAttendanceOnly = user\.role === "welcome"/);
  assert.match(dashboardSource, /pinned-attendance-total/);
  assert.match(dashboardSource, /title="상세 출석 통계"/);
  assert.match(dashboardSource, /const worshipEventIdsForDate = sameDateEvents\.filter/);
  assert.match(dashboardSource, /isPresentForAnyEvent\(member, worshipEventIdsForDate\)/);
  assert.match(dashboardSource, /\[\.\.\.new Set\(sameDateEvents\.map\(\(event\) => event\.title\)\)\]\.join\(" · "\)/);
  assert.match(dashboardSource, /welcome-attendance-input-panel/);
  assert.match(dashboardSource, /aria-label="웰컴팀 예배 출석 입력"/);
  assert.match(dashboardSource, /toggleLeaderExtraAttendance/);
  assert.match(dashboardSource, /communityLeaderRoleLabels/);
  assert.match(dashboardSource, /leader-extra-toggle/);
  assert.match(dashboardSource, /leaderRole \|\| \(communityLeaderGroup && member\.groupId === communityLeaderGroup\.id\)/);
  assert.match(dashboardSource, /설정 필요/);
  assert.match(actionsSource, /attendance\.extra_leader\.toggle/);
  assert.match(actionsSource, /attendance:extras:write/);
  assert.match(actionsSource, /getCommunityLeaderRoleValue/);
  assert.match(actionsSource, /공동체 리더 구분이 있거나 공동체 리더 순에 속한 멤버만 예배 추가 출석으로 체크할 수 있습니다/);
  assert.match(communityLeaderAttendanceRolesSource, /community_leader_role/);
  assert.match(dashboardSource, /!isWelcomeAttendanceOnly && hasExplicitAttendanceSelection/);
  assert.match(dashboardSource, /!isWelcomeAttendanceOnly \? \(/);
  assert.match(dashboardSource, /AttendanceMemberActionModal/);
  assert.match(dashboardSource, /AttendanceReasonModal/);
  assert.match(dashboardSource, /<AttendanceMemberActionModal[\s\S]*attendanceEvents=\{attendanceOverviewEvents\}/);
  assert.match(dashboardSource, /<AttendanceReasonModal[\s\S]*attendanceEvents=\{attendanceOverviewEvents\}/);
  assert.match(dashboardSource, /snapshot-grid-row snapshot-member-row/);
  assert.match(dashboardSource, /snapshot-member-name/);
  assert.match(dashboardSource, /snapshot-status-button/);
  assert.match(dashboardSource, /handleToggleAttendanceEvent/);
  assert.match(dashboardSource, /setAttendanceMemberModal/);
  assert.match(dashboardSource, /상세보기/);
  assert.match(dashboardSource, /사유 입력/);
  assert.match(globalCssSource, /group-attendance-snapshot/);
  assert.match(globalCssSource, /snapshot-mini-metrics/);
  assert.match(globalCssSource, /\.snapshot-grid-row/);
  assert.doesNotMatch(globalCssSource, /\.snapshot-member-row \{\s*display: contents/s);
  assert.doesNotMatch(globalCssSource, /\.group-attendance-snapshot-grid\.two-events\s*\{\s*grid-template-columns/s);
  assert.match(globalCssSource, /grid-template-columns: repeat\(4, minmax\(64px, 1fr\)\)/);
  assert.match(globalCssSource, /attendance-group-strip/);
  assert.match(globalCssSource, /snapshot-member-name/);
  assert.match(globalCssSource, /snapshot-status-button/);
  assert.match(globalCssSource, /attendance-member-modal/);
  assert.match(globalCssSource, /attendance-modal-reason-form/);
  assert.match(globalCssSource, /snapshot-status\.present/);
});

test("dashboard metric cards use role-independent server metrics", () => {
  assert.match(appPageDataSource, /export function buildDashboardMetrics/);
  assert.match(appPageDataSource, /export function buildGlobalAppStats/);
  assert.match(dataSource, /export async function getPublicDashboardData/);
  assert.match(dataSource, /get_public_dashboard_members/);
  assert.match(dataSource, /get_public_dashboard_groups/);
  assert.match(dataSource, /get_public_permission_role_counts/);
  assert.match(appPageDataSource, /if \(!hasPermission\(currentMember\.role, "members:write"\)\)/);
  assert.match(appPageDataSource, /publicDashboardData = await getPublicDashboardData/);
  assert.match(appPageDataSource, /isMissingPublicDashboardDataRpc/);
  assert.match(appPageDataSource, /code === "PGRST202"/);
  assert.match(appPageDataSource, /globalStats = buildGlobalAppStats\(/);
  assert.match(homePageSource, /dashboardMetrics=\{readyData\.dashboardMetrics\}/);
  assert.match(homePageSource, /globalStats=\{readyData\.globalStats\}/);
  assert.match(dashboardSource, /dashboardMetrics\?: DashboardMetrics/);
  assert.match(dashboardSource, /globalStats\?: GlobalAppStats/);
  assert.match(dashboardSource, /const metrics = dashboardMetrics \?\?/);
  assert.match(dashboardSource, /globalStats\?\.statisticsSummary/);
  assert.match(dashboardSource, /globalStats\?\.groupAttendanceSummary/);
  assert.match(dashboardSource, /globalStats\?\.permissions/);
  assert.match(dashboardSource, /metrics\.totalMembers/);
  assert.match(dashboardSource, /metrics\.attendanceEligibleMembers/);
});

test("app page data avoids avoidable serial fetches", () => {
  assert.match(dataSource, /Promise\.all\(\[\s*supabase\s*\.from\("attendance_events"\)/);
  assert.match(dataSource, /supabase\.rpc\("get_public_dashboard_groups"\)/);
  assert.match(dataSource, /supabase\.rpc\("get_public_dashboard_members"\)/);
  assert.match(dataSource, /supabase\.rpc\("get_public_permission_role_counts"\)/);
  assert.match(appPageDataSource, /type AppPageKind =/);
  assert.match(appPageDataSource, /const page = options\.page \?\? "dashboard"/);
  assert.match(appPageDataSource, /const shouldLoadCustomFields = page === "profile" \|\| page === "member-detail"/);
  assert.match(appPageDataSource, /const shouldLoadAuditLogs = page === "audit"/);
  assert.match(appPageDataSource, /const shouldLoadImportantLinks = page === "links"/);
  assert.match(appPageDataSource, /const shouldLoadMemberStatusMessages = page === "dashboard"/);
  assert.match(appPageDataSource, /const \[\s*allCustomFieldDefinitions,\s*auditLogs,\s*deletedAuthUsers,\s*importantLinks,\s*memberStatusMessagesData,\s*adminFeedbackMessages,\s*memberLinkRequests,\s*newFamilyApplicants,\s*attendanceExtraCounts,\s*\] = await Promise\.all/);
  assert.match(appPageDataSource, /shouldLoadAuditLogs && canManageRoles \? getAuditLogs\(supabase\) : Promise\.resolve\(undefined\)/);
  assert.match(homePageSource, /getAppPageData\(\{ page: "dashboard" \}\)/);
  assert.match(profilePageSource, /getAppPageData\(\{ page: "profile" \}\)/);
  assert.match(feedbackPageSource, /getAppPageData\(\{ page: "feedback" \}\)/);
  assert.doesNotMatch(globalCssSource, /cdn\.jsdelivr\.net/);
  assert.match(globalCssSource, /content-visibility: auto/);
});

test("common aggregate stats use unscoped server data while pages receive scoped members", () => {
  assert.match(publicDashboardDataSource, /security definer/);
  assert.match(publicDashboardDataSource, /grant execute on function get_public_dashboard_members\(\) to authenticated/);
  assert.match(publicPermissionRoleCountsSource, /create or replace function get_public_permission_role_counts\(\)/);
  assert.match(publicPermissionRoleCountsSource, /returns table \(\s*role member_role,\s*member_count bigint\s*\)/);
  assert.match(publicPermissionRoleCountsSource, /coalesce\(m\.email, ''\) not ilike '%@merged\.local'/);
  assert.match(publicPermissionRoleCountsSource, /coalesce\(\(m\.custom_fields ->> 'test_account'\)::boolean, false\) = false/);
  assert.match(publicPermissionRoleCountsSource, /grant execute on function get_public_permission_role_counts\(\) to authenticated/);
  assert.match(publicDashboardDataSource, /jsonb_build_object\(\s*'english_name'/);
  assert.match(publicDashboardDataSource, /'test_account', m\.custom_fields -> 'test_account'/);
  assert.doesNotMatch(publicDashboardDataSource, /'phone'/);
  assert.match(publicDashboardCommunityLeaderRoleSource, /get_public_dashboard_members/);
  assert.match(publicDashboardCommunityLeaderRoleSource, /'community_leader_role', m\.custom_fields -> 'community_leader_role'/);
  assert.match(schemaSource, /'community_leader_role', m\.custom_fields -> 'community_leader_role'/);
  assert.match(testAccountStatsExclusionSource, /get_public_dashboard_members/);
  assert.match(testAccountStatsExclusionSource, /'test_account', m\.custom_fields -> 'test_account'/);
  assert.match(testAccountStatsExclusionSource, /coalesce\(\(m\.custom_fields ->> 'test_account'\)::boolean, false\) = false/);
  assert.match(appPageDataSource, /const memberScopeSource =/);
  assert.match(appPageDataSource, /currentMember\.role === "welcome" && page === "attendance" \? publicDashboardData\.members : dashboardData\.members/);
  assert.match(appPageDataSource, /const scopedMembers = scopeMembersForRole/);
  assert.match(appPageDataSource, /members: scopedMembers/);
  assert.match(appPageDataSource, /publicDashboardData\.members/);
  assert.match(appPageDataSource, /publicDashboardData\.groups/);
  assert.match(appPageDataSource, /createServiceRoleClient/);
  assert.match(appPageDataSource, /getServiceRolePermissionCounts/);
  assert.match(appPageDataSource, /select\("role, email, status, custom_fields"\)\.neq\("status", "inactive"\)/);
  assert.match(appPageDataSource, /customFields\.test_account === true/);
  assert.match(appPageDataSource, /isStatsExcludedMember/);
  assert.match(appPageDataSource, /permissionRoleCounts = \(await getServiceRolePermissionCounts\(\)\) \?\? publicPermissionRoleCounts/);
  assert.match(appPageDataSource, /globalStats,/);
  assert.match(appPageDataSource, /statisticsSummary: buildStatisticsSummary\(activeMembers\)/);
  assert.match(appPageDataSource, /dashboardInsights: buildDashboardInsights\(activeMembers, groups\)/);
  assert.match(appPageDataSource, /groupPage: buildGroupPageStats\(activeMembers, groups\)/);
  assert.match(appPageDataSource, /attendance: \{/);
  assert.match(dashboardSource, /globalStats\?\.groupPage/);
  assert.match(dashboardSource, /globalStats\?\.attendance/);
  assert.match(dashboardSource, /globalStats\?\.dashboardInsights \?\? buildDashboardInsights\(activeMembers, groups\)/);
  assert.match(dashboardSource, /displayCurrentAttendanceRate/);
  assert.match(dashboardSource, /displayAggregateGroupStats/);
});

test("attendance extra counts are stored with restricted welcome team access", () => {
  assert.match(schemaSource, /create table attendance_extra_counts/);
  assert.match(schemaSource, /event_date date primary key/);
  assert.match(schemaSource, /clergy_count integer not null default 0/);
  assert.match(schemaSource, /team_leader_count integer not null default 0/);
  assert.match(schemaSource, /visitor_count integer not null default 0/);
  assert.match(schemaSource, /new_family_count integer not null default 0/);
  assert.match(schemaSource, /alter table attendance_extra_counts enable row level security/);
  assert.match(schemaSource, /current_member_role\(\) in \('owner', 'admin', 'welcome'\)/);
  assert.match(attendanceExtraCountsSource, /create table if not exists attendance_extra_counts/);
  assert.match(attendanceExtraCountsSource, /public\.current_member_role\(\) in \('owner', 'admin', 'welcome'\)/);
});

test("attendance extra counts load through page data and save through a separate permission", () => {
  assert.match(dataSource, /export async function getAttendanceExtraCounts/);
  assert.match(dataSource, /\.from\("attendance_extra_counts"\)/);
  assert.match(appPageDataSource, /attendanceExtraCounts: AttendanceExtraCount\[\]/);
  assert.match(appPageDataSource, /hasPermission\(currentMember\.role, "attendance:extras:read"\)/);
  assert.match(appPageDataSource, /getAttendanceExtraCounts\(supabase\)/);
  assert.match(actionsSource, /attendanceExtraCountSchema/);
  assert.match(actionsSource, /getAuthorizedCurrentMember\("attendance:extras:write"\)/);
  assert.match(actionsSource, /\.from\("attendance_extra_counts"\)/);
  assert.match(actionsSource, /attendance_extra_counts\.update/);
  assert.match(actionsSource, /metadata: \{ eventDate: parsed\.eventDate \}/);
  assert.doesNotMatch(actionsSource, /attendance_extra_counts\.update[\s\S]{0,240}targetId: parsed\.eventDate/);
  assert.match(dashboardSource, /canManageAttendanceExtraCounts/);
  assert.match(dashboardSource, /attendance-total-panel/);
  assert.match(dashboardSource, /totalAttendanceWithExtras/);
});

test("mobile navigation collapses into an expandable dropdown", () => {
  assert.match(layoutSource, /<div className="sidebar-menu">/);
  assert.match(layoutSource, /className="mobile-menu-control"[\s\S]*type="checkbox"/);
  assert.match(layoutSource, /<label className="mobile-menu-toggle" htmlFor="mobile-menu-control">/);
  assert.match(layoutSource, /<MobileAwareNav items=\{visibleNavItems\} \/>/);
  assert.match(mobileAwareNavSource, /"use client"/);
  assert.match(mobileAwareNavSource, /function closeMobileMenu/);
  assert.match(mobileAwareNavSource, /control\.checked = false/);
  assert.match(mobileAwareNavSource, /onClick=\{closeMobileMenu\}/);
  assert.match(globalCssSource, /@media \(max-width: 760px\)[\s\S]*\.mobile-menu-control:not\(:checked\) ~ \.nav-list/);
  assert.match(globalCssSource, /\.mobile-menu-control:checked ~ \.nav-list[\s\S]*mobileMenuReveal/);
});

test("primary navigation hides pages without the current role permission", () => {
  assert.match(layoutSource, /const navRole = await getCurrentNavRole\(\)/);
  assert.match(layoutSource, /const visibleNavItems = getVisibleNavItems\(navRole\)/);
  assert.match(navigationSource, /requiredPermission: "new-family:read"/);
  assert.match(navigationSource, /requiredPermission: "attendance:read"/);
  assert.match(navigationSource, /requiredPermission: "roles:manage"/);
  assert.match(navigationSource, /href: "\/members"[\s\S]*hiddenForRoles: \["welcome", "member"\]/);
  assert.match(navigationSource, /href: "\/groups"[\s\S]*hiddenForRoles: \["welcome", "member"\]/);
  assert.match(navigationSource, /return navItems\.filter/);
  assert.match(navigationSource, /item\.hiddenForRoles\?\.includes\(role\)/);
  assert.match(navigationSource, /hasPermission\(role, item\.requiredPermission\)/);
  assert.doesNotMatch(mobileAwareNavSource, /const navItems = \[/);
});

test("global styles include sharper control radius pass", () => {
  assert.match(globalCssSource, /Sharper UI pass/);
  assert.match(globalCssSource, /\.primary-button,[\s\S]*\.event-chip \{[\s\S]*border-radius: 4px/);
  assert.match(globalCssSource, /\.status-pill,[\s\S]*\.permission-chip,[\s\S]*\.progress span \{[\s\S]*border-radius: 4px/);
  assert.match(globalCssSource, /\.topbar-actions \{[\s\S]*align-items: center/);
  assert.match(globalCssSource, /\.panel-heading \{[\s\S]*align-items: flex-start/);
  assert.match(globalCssSource, /\.section-nav-links \{[\s\S]*align-items: center/);
  assert.match(globalCssSource, /\.attendance-card \{[\s\S]*minmax\(140px, 0\.55fr\)/);
  assert.match(globalCssSource, /\.attendance-type-actions \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(globalCssSource, /\.attendance-card \.attendance-type-actions \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(globalCssSource, /\.attendance-toggle/);
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
  assert.match(dashboardSource, /getAttendanceVisibleGroups/);
  assert.match(dashboardSource, /attendanceVisibleGroups/);
  assert.match(appPageDataSource, /getAttendanceVisibleGroups/);
  assert.match(appPageDataSource, /attendanceGroupIds/);
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
  assert.match(dashboardSource, /hasUnread \? "● " : ""/);
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
  assert.doesNotMatch(dashboardSource, /id="attendance-events"/);
  assert.match(dashboardSource, /attendance-check-toolbar/);
  assert.match(globalCssSource, /attendance-check-toolbar/);
  assert.match(dashboardSource, /attendanceCheckEventNames/);
  assert.doesNotMatch(dashboardSource, /출석 종류/);
  assert.doesNotMatch(dashboardSource, /attendance-mode-switcher/);
  assert.doesNotMatch(globalCssSource, /attendance-mode-switcher/);
  assert.match(dashboardSource, /체크할 날짜 선택/);
  assert.match(dashboardSource, /id="attendance-stats"[\s\S]*id="attendance-create"[\s\S]*id="attendance-checklist"/);
  assert.match(dashboardSource, /주일 예배[\s\S]*순모임/);
  assert.match(dashboardSource, /event-create-note/);
  assert.match(dashboardSource, /선택한 날짜 안에 주일 예배와 순모임 출석 체크가 함께 만들어집니다/);
  assert.match(dashboardSource, /attendanceOverviewEvents\.length === 0/);
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
  assert.match(actionsSource, /eq\("event_date", beforeData\.event_date\)/);
  assert.match(actionsSource, /in\("title", attendanceEventTitles\)/);
  assert.match(actionsSource, /선택한 날짜의 주일 예배와 순모임 출석 이벤트를 함께 삭제했습니다/);
  assert.match(actionsSource, /canUseDeleteActions\(currentMember\.role\)/);
  assert.match(dashboardSource, /eventPendingDelete/);
  assert.match(dashboardSource, /이 날짜의 출석 이벤트를 지울까요/);
  assert.match(dashboardSource, /주일 예배와 순모임 이벤트를 함께 삭제합니다/);
  assert.match(dashboardSource, /deleteEventAction/);
  assert.doesNotMatch(dashboardSource, /member\.groupName} · {member\.phone/);
});

test("dashboard gives leaders a mobile shortcut to their group attendance", () => {
  assert.match(dashboardSource, /mobile-attendance-shortcut/);
  assert.match(dashboardSource, /chooseAttendanceShortcutEvent/);
  assert.match(dashboardSource, /\{ownGroup\.name\} · \{attendanceShortcutEvent\.eventDate\}/);
  assert.doesNotMatch(dashboardSource, /\{ownGroup\.name\} · \{attendanceShortcutEvent\.eventDate\} · \{attendanceShortcutEvent\.title\}/);
  assert.match(dashboardSource, /groupId=\$\{ownGroup\.id\}&mode=group#attendance-checklist/);
  assert.match(globalCssSource, /mobile-attendance-shortcut/);
});

test("attendance event setup supports batch creation and Sunday auto-create in Pacific time", () => {
  assert.match(dataSource, /timeZone: "America\/Los_Angeles"/);
  assert.match(dataSource, /autoCreateSundayWorship/);
  assert.match(dataSource, /getLosAngelesMostRecentSunday/);
  assert.match(dataSource, /const DEFAULT_ATTENDANCE_TITLES = \["주일 예배", "순모임"\] as const/);
  assert.match(dataSource, /for \(const title of DEFAULT_ATTENDANCE_TITLES\)/);
  assert.match(appPageDataSource, /hasPermission\(currentMember\.role, "attendance:write"\)/);
  assert.match(appPageDataSource, /createdByMemberId: currentMember\.id/);
  assert.match(actionsSource, /titlesToCreate/);
  assert.match(actionsSource, /\.in\("title", parsed\.titles\)/);
  assert.match(actionsSource, /이미 있던 \$\{skippedCount\}개는 건너뛰었습니다/);
});

test("weekly Sunday attendance auto-create is backed by a protected Vercel Cron route", () => {
  assert.match(vercelConfigSource, /"path": "\/api\/cron\/ensure-sunday-attendance"/);
  assert.match(vercelConfigSource, /"schedule": "0 18 \* \* 0"/);
  assert.match(cronAttendanceRouteSource, /process\.env\.CRON_SECRET/);
  assert.match(cronAttendanceRouteSource, /authorization/);
  assert.match(cronAttendanceRouteSource, /createServiceRoleClient/);
  assert.match(cronAttendanceRouteSource, /targetDate: eventDate/);
  assert.match(supabaseEnvSource, /SUPABASE_SERVICE_ROLE_KEY/);
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
  assert.match(actionsSource, /export async function renameGroup/);
  assert.match(actionsSource, /action: "group\.rename"/);
  assert.match(actionsSource, /getAuthorizedCurrentMember\("groups:write"\)/);
  assert.match(dashboardSource, /renameGroup/);
  assert.match(dashboardSource, /순 이름 변경/);
  assert.match(dashboardSource, /이름 변경/);
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
  assert.match(dashboardSource, /상세보기/);
  assert.match(dashboardSource, /group-modal-admin-tools/);
  assert.match(dashboardSource, /setGroupMembersModal\(node\.group\)/);
  assert.doesNotMatch(dashboardSource, /<section className="group-grid"/);
  assert.doesNotMatch(dashboardSource, /group-card-overview/);
  assert.doesNotMatch(dashboardSource, /group-member-preview/);
  assert.doesNotMatch(dashboardSource, /group-card-stats/);
  assert.doesNotMatch(dashboardSource, /확인을 위해 순 이름을 입력/);
  assert.doesNotMatch(actionsSource, /const deleteGroupSchema[\s\S]{0,120}confirmName/);
  assert.match(memberDetailSource, /!isMergedPlaceholderMember\(item\)/);
});

test("group page renders a central Newavely network map", () => {
  assert.match(dashboardSource, /const networkNodes = visibleGroups\.map/);
  assert.match(dashboardSource, /className="panel group-network-panel"/);
  assert.match(dashboardSource, /className="group-network-lines"/);
  assert.match(dashboardSource, /className="group-network-center"/);
  assert.match(dashboardSource, /src="\/newave-icon\.png"/);
  assert.match(dashboardSource, /<strong>뉴웨이브<\/strong>/);
  assert.match(dashboardSource, /순장 \{node\.group\.leaderName\}/);
  assert.match(dashboardSource, /className="group-network-node"/);
  assert.match(dashboardSource, /draggable=\{false\}/);
  assert.match(globalCssSource, /\.group-network-map/);
  assert.match(globalCssSource, /\.group-network-lines line/);
  assert.match(globalCssSource, /\.group-network-center/);
  assert.match(globalCssSource, /\.group-network-node:hover/);
  assert.match(globalCssSource, /\.group-network-node:not\(:disabled\):active/);
  assert.doesNotMatch(globalCssSource, /\.group-network-node:hover[\s\S]{0,240}scale\(1\.05\)/);
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
  assert.match(dashboardSource, /permissionRoleCounts = globalStats\?\.permissions\.roleCounts \?\? \[\]/);
  assert.match(dashboardSource, /activeAdminCount = globalStats\?\.permissions\.activeAdminCount \?\? activeAdmins\.length/);
  assert.match(dashboardSource, /leaderAndStaffCount =\s*globalStats\?\.permissions\.leaderAndStaffCount/);
  assert.match(dashboardSource, /roleMemberCount = roleCountByRole\.get\(role\) \?\? roleMembers\.length/);
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

test("member detail manages multiple ministry labels", () => {
  assert.match(dashboardSource, /MemberMinistryLabels/);
  assert.match(dashboardSource, /MemberMinistryEditor/);
  assert.match(dashboardSource, /aria-label="사역팀 수정"/);
  assert.match(dashboardSource, /name="custom_ministries"/);
  assert.match(dashboardSource, /member-ministry-labels/);
  assert.match(dashboardSource, /member-detail-ministry-summary/);
  assert.match(memberDetailSource, /getMemberMinistryValues\(member\.customFields\)/);
  assert.match(memberDetailSource, /MemberMinistrySummary/);
  assert.match(memberDetailSource, /custom_ministries/);
  assert.match(memberDetailSource, /ministry-label-chip/);
  assert.match(memberDetailSource, /!\["english_name", "ministries", "ministry_1", "ministry_2"\]\.includes\(field\.key\)/);
  assert.match(actionsSource, /formData\.has\("custom_ministries"\)/);
  assert.match(actionsSource, /formData\.getAll\("custom_ministries"\)/);
  assert.match(actionsSource, /normalizeMinistryList\(normalized\.ministries\)/);
  assert.match(actionsSource, /normalized\.ministry_1 = ministries\[0\] \?\? null/);
  assert.match(globalCssSource, /\.ministry-label-chip input:checked \+ span/);
  assert.match(globalCssSource, /\.member-ministry-label/);
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
  assert.match(navigationSource, /href: "\/links"/);
  assert.match(globalCssSource, /link-grid/);
});

test("member status messages are short self-managed dashboard updates", () => {
  assert.match(schemaSource, /create table member_status_messages/);
  assert.match(memberStatusMessagesSource, /char_length\(message\) <= 80/);
  assert.match(memberStatusMessagesSource, /member_id = current_member_id\(\)/);
  assert.match(dataSource, /export async function getMemberStatusMessages/);
  assert.match(dataSource, /member_status_messages/);
  assert.match(appPageDataSource, /memberStatusMessages/);
  assert.match(appPageDataSource, /export function enrichMemberStatusMessages/);
  assert.match(appPageDataSource, /memberName: member\.displayName/);
  assert.match(appPageDataSource, /groupName: member\.groupName/);
  assert.match(appPageDataSource, /getMemberStatusMessages\(supabase\)/);
  assert.match(appPageDataSource, /enrichMemberStatusMessages\(memberStatusMessagesData, publicDashboardData\.members\)/);
  assert.match(actionsSource, /export async function updateMyStatusMessage/);
  assert.match(actionsSource, /max\(80/);
  assert.match(homePageSource, /memberStatusMessages=\{readyData\.memberStatusMessages\}/);
  assert.match(dashboardSource, /MemberStatusBoard/);
  assert.match(dashboardSource, /오늘의 한마디/);
  assert.match(memberDetailSource, /MemberStatusComposer/);
  assert.doesNotMatch(appGateSource, /data\.user\.role === "member"/);
  assert.match(memberStatusComposerSource, /quickStatusMessages/);
  assert.match(memberStatusComposerSource, /textarea/);
  assert.match(memberStatusComposerSource, /비우기/);
  assert.match(globalCssSource, /member-status-board/);
  assert.match(globalCssSource, /status-composer-panel/);
  assert.match(globalCssSource, /status-quick-list/);
  assert.match(globalCssSource, /status-input-shell/);
});

test("member role can self-serve profile groups and attendance without admin controls", () => {
  assert.match(actionsSource, /getAuthorizedCurrentMember\("members:read"\)/);
  assert.match(actionsSource, /isOwnProfileUpdate/);
  assert.match(actionsSource, /본인 프로필만 수정할 수 있습니다/);
  assert.match(actionsSource, /nextGroupId = canManageMembers \? parsed\.groupId : \(beforeData\.group_id as string \| null\)/);
  assert.match(actionsSource, /nextStatus = canManageMembers \? parsed\.status : \(beforeData\.status as "active" \| "new" \| "care" \| "inactive"\)/);
  assert.match(actionsSource, /role: formData\.has\("role"\) \? formData\.get\("role"\) : beforeData\.role/);
  assert.match(actionsSource, /groupId: formData\.has\("groupId"\) \? formData\.get\("groupId"\) : beforeData\.group_id/);
  assert.match(actionsSource, /본인 추가 정보만 수정할 수 있습니다/);
  assert.match(memberDetailSource, /canEditProfile/);
  assert.match(memberDetailSource, /disabled=\{!canEditProfile\}/);
  assert.match(memberDetailSource, /<input name="groupId" type="hidden"/);
  assert.match(memberDetailSource, /<input name="role" type="hidden"/);
  assert.match(memberDetailSource, /<input name="status" type="hidden"/);
  assert.match(dashboardSource, /!canManageRoles \? <input name="role" type="hidden" value=\{selectedMember\.role\}/);
  assert.match(dashboardSource, /const isMemberView = user\.role === "member"/);
  assert.match(dashboardSource, /visibleGroups/);
  assert.match(dashboardSource, /user\.role !== "member" \|\| member\.id === currentAttendanceMember\?\.id/);
  assert.match(schemaSource, /current_member_group_id/);
  assert.match(schemaSource, /users can update their own member profile/);
  assert.match(schemaSource, /role = 'member'::member_role/);
  assert.match(schemaSource, /group_id is not distinct from current_member_group_id\(\)/);
});

test("new member creation defaults to member role for non-role managers", () => {
  assert.match(actionsSource, /role: formData\.get\("role"\) \|\| "member"/);
  assert.match(dashboardSource, /<select name="role" defaultValue="member" disabled=\{!canManageRoles\}>/);
  assert.match(dashboardSource, /!canManageRoles \? <input name="role" type="hidden" value="member" \/> : null/);
});

test("admins can flag test accounts and shared stats exclude them", () => {
  assert.match(actionsSource, /const isTestAccount = canManageRoles && formData\.get\("isTestAccount"\) === "on"/);
  assert.match(actionsSource, /test_account: true/);
  assert.match(dashboardSource, /name="isTestAccount"/);
  assert.match(dashboardSource, /테스트 계정으로 표시하고 모든 통계에서 제외/);
  assert.match(dashboardSource, /테스트 계정으로 승인하고 모든 통계에서 제외/);
  assert.doesNotMatch(dashboardSource, /테스트 계정으로 등록하고 모든 통계에서 제외/);
  assert.match(memberDetailSource, /name="isTestAccount"/);
  assert.match(memberDetailSource, /member\.customFields\.test_account === true/);
  assert.match(dashboardSource, /!isStatsExcludedMember\(member\)/);
  assert.match(appPageDataSource, /!isStatsExcludedMember\(member\)/);
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
  assert.match(navigationSource, /href: "\/feedback"/);
  assert.match(globalCssSource, /feedback-inbox-panel/);
});

test("new family applicants sync from Google Sheets into a role-gated roster", () => {
  assert.match(schemaSource, /create table new_family_applicants/);
  assert.match(schemaSource, /week_3/);
  assert.match(schemaSource, /expected_group text/);
  assert.match(newFamilyApplicantsSource, /current_member_role\(\) in \('owner', 'admin', 'welcome'\)/);
  assert.match(welcomeTeamNewFamilyPoliciesSource, /current_member_role\(\) in \('owner', 'admin', 'welcome'\)/);
  assert.match(newFamilyApplicantsSource, /source_key text not null unique/);
  assert.match(newFamilyApplicantsSource, /expected_group text/);
  assert.match(newFamilyExpectedGroupSource, /add column if not exists expected_group text/);
  assert.match(newFamilyStatusFlowSource, /where status = 'in_progress'/);
  assert.match(newFamilyStatusFlowSource, /week_1/);
  assert.match(newFamilyStatusFlowSource, /week_2/);
  assert.match(newFamilyStatusFlowSource, /week_3/);
  assert.match(dataSource, /export async function getNewFamilyApplicants/);
  assert.match(appPageDataSource, /"new-family"/);
  assert.match(appPageDataSource, /canReadNewFamily = hasPermission\(currentMember\.role, "new-family:read"\)/);
  assert.match(appPageDataSource, /shouldLoadNewFamilyApplicants && canReadNewFamily/);
  assert.match(googleSheetsSource, /export async function readGoogleSheetValues/);
  assert.match(googleSheetsSource, /scannedSheetNames/);
  assert.match(googleSheetsSource, /values\.length > 1/);
  assert.match(newFamilySyncSource, /1T-DD9i7lBoFqK6qHXKSKeEgs-FOsq24c8dWzwLWFGrg/);
  assert.match(newFamilySyncSource, /normalizedKey\.includes\(alias\)/);
  assert.match(newFamilySyncSource, /function pickLikelyName/);
  assert.match(newFamilySyncSource, /source_key: `\$\{spreadsheetId\}:\$\{sheetName\}:\$\{sourceRowNumber\}`/);
  assert.match(actionsSource, /export async function syncNewFamilyApplicants/);
  assert.match(actionsSource, /getAuthorizedCurrentMember\("new-family:write"\)/);
  assert.match(actionsSource, /행을 읽었지만 등록 가능한 새가족 이름을 찾지 못했습니다/);
  assert.match(actionsSource, /export async function updateNewFamilyApplicant/);
  assert.match(actionsSource, /expectedGroup: formData\.get\("expectedGroup"\)/);
  assert.match(actionsSource, /expected_group: parsed\.expectedGroup/);
  assert.match(actionsSource, /week_3/);
  assert.match(actionsSource, /export async function convertNewFamilyApplicantToMember/);
  assert.match(actionsSource, /action: "new_family\.convert_to_member"/);
  assert.match(actionsSource, /pickNewFamilySourceValue/);
  assert.match(actionsSource, /new_family_assignee/);
  assert.match(actionsSource, /new_family_completion_due_date/);
  assert.match(newFamilyCronSource, /CRON_SECRET/);
  assert.match(newFamilyCronSource, /createAdminClient/);
  assert.match(vercelConfigSource, /\/api\/cron\/sync-new-family/);
  assert.match(newFamilyPageSource, /NewFamilyPageContent/);
  assert.match(dashboardSource, /export function NewFamilyPageContent/);
  assert.match(dashboardSource, /hasPermission\(user\.role, "new-family:read"\)/);
  assert.match(dashboardSource, /hasPermission\(user\.role, "new-family:write"\)/);
  assert.match(dashboardSource, /new-family-metrics/);
  assert.match(dashboardSource, /newFamilyStatusOrder/);
  assert.match(dashboardSource, /수료예정/);
  assert.match(dashboardSource, /sortBy/);
  assert.match(dashboardSource, /NewFamilyBreakdownCard/);
  assert.match(dashboardSource, /getNewFamilySourceValue/);
  assert.match(dashboardSource, /getNewFamilyExpectedGroup/);
  assert.match(dashboardSource, /applicant\.expectedGroup \|\| applicant\.groupInterest/);
  assert.match(dashboardSource, /name="expectedGroup"/);
  assert.match(dashboardSource, /시트 값 사용/);
  assert.match(dashboardSource, /예정 순/);
  assert.match(dashboardSource, /new-family-roster-layout/);
  assert.match(dashboardSource, /new-family-table/);
  assert.match(dashboardSource, /new-family-quick-summary/);
  assert.match(dashboardSource, /아직 동기화된 새가족 신청이 없습니다/);
  assert.match(dashboardSource, /멤버로 등록/);
  assert.match(dashboardSource, /수료\/등록은 멤버 로스터 등록으로 완료됩니다/);
  assert.doesNotMatch(dashboardSource, /데이터 출처/);
  assert.match(navigationSource, /href: "\/new-family"/);
  assert.match(globalCssSource, /new-family-stage-panel/);
  assert.match(globalCssSource, /new-family-insights/);
  assert.match(globalCssSource, /new-family-breakdown-card/);
  assert.match(globalCssSource, /new-family-status\.completed/);
  assert.match(globalCssSource, /new-family-status\.week_3/);
  assert.match(globalCssSource, /data-theme="dark"\] \.new-family-status\.completed/);
  assert.match(globalCssSource, /new-family-management-modal/);
  assert.match(globalCssSource, /new-family-conversion-form/);
  assert.match(globalCssSource, /new-family-side-form label/);
  assert.match(globalCssSource, /feedback-admin-form label/);
});
