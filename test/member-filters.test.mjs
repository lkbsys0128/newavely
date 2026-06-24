import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { defaultMemberFilters, filterMembers, findPotentialDuplicateMembers, isMergedPlaceholderMember, isStatsExcludedMember, isTestAccountMember } =
  loadTsModule("../src/lib/member-filters.ts");
const { getAttendanceVisibleGroups, isAttendanceVisibleGroup } = loadTsModule("../src/lib/group-filters.ts");
const { isActionableLinkRequest } = loadTsModule("../src/lib/member-link-requests.ts");

function member(overrides) {
  return {
    id: "member-id",
    authUserId: null,
    name: "기본 멤버",
    phone: "010-0000-0000",
    groupId: null,
    groupName: "미배정",
    role: "member",
    status: "active",
    email: "",
    address: "",
    baptismStatus: "",
    notes: "",
    customFields: {},
    present: false,
    attendanceHistory: [],
    careFollowups: [],
    ...overrides,
  };
}

test("filterMembers filters by text, group, role, status, and account connection", () => {
  const members = [
    member({
      id: "a",
      authUserId: "google-a",
      name: "김관리",
      email: "admin@example.com",
      groupId: "group-a",
      groupName: "A순",
      role: "admin",
    }),
    member({
      id: "b",
      name: "이리더",
      groupId: "group-b",
      groupName: "B순",
      role: "leader",
      status: "care",
      notes: "주중 연락 필요",
    }),
    member({
      id: "c",
      name: "박멤버",
      groupId: null,
      groupName: "미배정",
      status: "inactive",
    }),
    member({
      id: "merged",
      name: "병합잔여",
      email: "merged-id@merged.local",
      status: "inactive",
    }),
  ];

  assert.deepEqual(
    filterMembers(members, { ...defaultMemberFilters, query: "연락" }).map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(
    filterMembers(members, { ...defaultMemberFilters, groupId: "group-a", role: "admin", account: "connected" }).map(
      (item) => item.id,
    ),
    ["a"],
  );
  assert.deepEqual(
    filterMembers(members, { ...defaultMemberFilters, groupId: "unassigned", status: "inactive" }).map((item) => item.id),
    ["c"],
  );
  assert.equal(isMergedPlaceholderMember(members[3]), true);
});

test("test accounts stay visible in rosters but are excluded from stats", () => {
  const testMember = member({ id: "test", name: "테스트 계정", customFields: { test_account: true } });
  const regularMember = member({ id: "regular", name: "실제 멤버" });

  assert.equal(isTestAccountMember(testMember), true);
  assert.equal(isStatsExcludedMember(testMember), true);
  assert.equal(isStatsExcludedMember(regularMember), false);
  assert.deepEqual(
    filterMembers([testMember, regularMember], defaultMemberFilters).map((item) => item.id),
    ["test", "regular"],
  );
});

test("attendance hides the community leader group from group choices and stats", () => {
  const groups = [
    { id: "leaders", name: "공동체 리더 순", leaderMemberId: null, leaderName: "미배정" },
    { id: "regular", name: "주환 순", leaderMemberId: null, leaderName: "미배정" },
  ];

  assert.equal(isAttendanceVisibleGroup(groups[0]), false);
  assert.equal(isAttendanceVisibleGroup(groups[1]), true);
  assert.deepEqual(
    getAttendanceVisibleGroups(groups).map((group) => group.id),
    ["regular"],
  );
});

test("findPotentialDuplicateMembers returns actionable login/import duplicate candidates", () => {
  const members = [
    member({ id: "imported", name: "홍길동", phone: "206-555-1111" }),
    member({ id: "login", authUserId: "google-user", name: "홍길동", phone: "2065551111", email: "hong@example.com" }),
    member({ id: "inactive", name: "홍길동", phone: "2065551111", status: "inactive" }),
  ];

  const candidates = findPotentialDuplicateMembers(members);

  assert.equal(candidates.length, 2);
  assert(candidates.some((candidate) => candidate.key === "phone:2065551111"));
  assert(candidates.every((candidate) => candidate.members.some((candidateMember) => candidateMember.id === "login")));
  assert(candidates.every((candidate) => candidate.members.some((candidateMember) => candidateMember.id === "imported")));
});

test("link request notifications only count pending first-login requests", () => {
  const baseRequest = {
    id: "request-id",
    requesterMemberId: "requester-id",
    requesterName: "새 로그인",
    requesterEmail: "new@example.com",
    requesterStatus: "new",
    targetMemberId: null,
    targetName: "관리자 확인 필요",
    targetEmail: "",
    status: "pending",
    note: "",
    createdAt: "2026-05-28T00:00:00.000Z",
    resolvedAt: null,
  };

  assert.equal(isActionableLinkRequest(baseRequest), true);
  assert.equal(isActionableLinkRequest({ ...baseRequest, requesterStatus: "active" }), false);
  assert.equal(isActionableLinkRequest({ ...baseRequest, requesterName: "알 수 없음" }), false);
  assert.equal(isActionableLinkRequest({ ...baseRequest, status: "approved" }), false);
  assert.equal(isActionableLinkRequest({ ...baseRequest, status: "rejected", resolvedAt: "2026-05-28T01:00:00.000Z" }), false);
});
