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
const actionsSource = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const globalCssSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const appGateSource = readFileSync(new URL("../src/components/app-page-gate.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
const googleSheetsSource = readFileSync(new URL("../src/lib/google-sheets.ts", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const memberDetailSource = readFileSync(new URL("../src/components/member-detail.tsx", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../src/components/onboarding-panel.tsx", import.meta.url), "utf8");
const profilePageSource = readFileSync(new URL("../src/app/profile/page.tsx", import.meta.url), "utf8");
const sectionNavSource = readFileSync(new URL("../src/components/section-nav.tsx", import.meta.url), "utf8");

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
  assert.match(actionsSource, /getAuthorizedCurrentMember\("members:write"\)/);
  assert.match(actionsSource, /canDeleteMemberRole/);
  assert.match(actionsSource, /member\.permanent_delete/);
  assert.match(actionsSource, /cascadingRecords/);
  assert.match(actionsSource, /closedPendingLinkRequests/);
  assert.match(actionsSource, /deletedCount !== 1/);
  assert.match(schemaSource, /authorized users can delete lower role members/);
  assert.match(deleteRolePoliciesSource, /authorized users can delete lower role members/);
  assert.match(deleteRolePoliciesSource, /leaders can delete groups/);
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
  assert.match(globalCssSource, /dashboard-insights/);
  assert.match(globalCssSource, /statistics-panel/);
  assert.match(globalCssSource, /upcoming-birthday-grid/);
  assert.match(globalCssSource, /mini-roster-card/);
});

test("mobile navigation collapses into an expandable dropdown", () => {
  assert.match(layoutSource, /<div className="sidebar-menu">/);
  assert.match(layoutSource, /className="mobile-menu-control"[\s\S]*type="checkbox"/);
  assert.match(layoutSource, /<label className="mobile-menu-toggle" htmlFor="mobile-menu-control">/);
  assert.match(globalCssSource, /@media \(max-width: 760px\)[\s\S]*\.mobile-menu-control:not\(:checked\) ~ \.nav-list/);
  assert.match(globalCssSource, /\.mobile-menu-control:checked ~ \.nav-list[\s\S]*mobileMenuReveal/);
});

test("global styles include sharper control radius pass", () => {
  assert.match(globalCssSource, /Sharper UI pass/);
  assert.match(globalCssSource, /\.primary-button,[\s\S]*\.event-chip \{[\s\S]*border-radius: 4px/);
  assert.match(globalCssSource, /\.status-pill,[\s\S]*\.permission-chip,[\s\S]*\.progress span \{[\s\S]*border-radius: 4px/);
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
  assert.match(dashboardSource, /selected-row/);
});

test("attendance checklist uses roster members and exposes search filters", () => {
  assert.match(dashboardSource, /isAttendanceRosterMember/);
  assert.match(dashboardSource, /member\.status === "active" \|\| member\.status === "care"/);
  assert.match(dashboardSource, /!isMergedPlaceholderMember\(member\)/);
  assert.match(dashboardSource, /attendanceSearchQuery/);
  assert.match(dashboardSource, /attendanceGroupId/);
  assert.match(dashboardSource, /attendance-check-grid/);
  assert.match(dashboardSource, /attendance-card/);
  assert.doesNotMatch(dashboardSource, /member\.groupName} · {member\.phone/);
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
  assert.doesNotMatch(dashboardSource, /확인을 위해 순 이름을 입력/);
  assert.doesNotMatch(actionsSource, /const deleteGroupSchema[\s\S]{0,120}confirmName/);
  assert.match(memberDetailSource, /!isMergedPlaceholderMember\(item\)/);
});

test("permissions page exposes member search for role management", () => {
  assert.match(dashboardSource, /roleSearchQuery/);
  assert.match(dashboardSource, /멤버 검색/);
  assert.match(dashboardSource, /filteredRoleManagedMembers/);
  assert.match(dashboardSource, /#permission-matrix[\s\S]*#admin-checks[\s\S]*#link-requests[\s\S]*#role-management/);
  assert.match(dashboardSource, /id="permission-matrix"[\s\S]*id="admin-checks"[\s\S]*id="link-requests"[\s\S]*id="role-management"/);
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
