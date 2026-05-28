import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { defaultMemberFilters, filterMembers, findPotentialDuplicateMembers, isMergedPlaceholderMember } = loadTsModule(
  "../src/lib/member-filters.ts",
);

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
