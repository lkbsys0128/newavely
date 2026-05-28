import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const staleLinkCleanupSource = readFileSync(new URL("../db/009_cleanup_stale_member_link_requests.sql", import.meta.url), "utf8");
const memberDeletePolicySource = readFileSync(new URL("../db/010_admin_member_delete_policy.sql", import.meta.url), "utf8");
const memberLinkAdminPolicySource = readFileSync(new URL("../db/011_member_link_request_admin_policy.sql", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const appGateSource = readFileSync(new URL("../src/components/app-page-gate.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
const memberDetailSource = readFileSync(new URL("../src/components/member-detail.tsx", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../src/components/onboarding-panel.tsx", import.meta.url), "utf8");
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
  assert.match(dashboardSource, /새 교적 생성 후 연결/);
  assert.match(memberDetailSource, /rejectedLinkRequest/);
  assert.match(memberLinkAdminPolicySource, /admins can update link requests/);
});

test("member permanent delete is admin-only and audited", () => {
  assert.match(actionsSource, /deleteMemberPermanently/);
  assert.match(actionsSource, /getAuthorizedCurrentMember\("roles:manage"\)/);
  assert.match(actionsSource, /member\.permanent_delete/);
  assert.match(actionsSource, /cascadingRecords/);
  assert.match(actionsSource, /closedPendingLinkRequests/);
  assert.match(actionsSource, /deletedCount !== 1/);
  assert.match(schemaSource, /admins can delete members/);
  assert.match(memberDeletePolicySource, /on members for delete/);
  assert.match(dashboardSource, /완전 삭제/);
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

test("legacy manual account merge entrypoint is not exposed", () => {
  assert.doesNotMatch(actionsSource, /export async function mergeMemberAccount/);
  assert.doesNotMatch(dashboardSource, /Google 계정 프로필 병합/);
  assert.doesNotMatch(dashboardSource, /권한에서 프로필 병합/);
});
