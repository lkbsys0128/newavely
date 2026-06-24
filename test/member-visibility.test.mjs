import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { scopeMembersForRole } = loadTsModule("../src/lib/member-visibility.ts");
const { roles } = loadTsModule("../src/lib/rbac.ts");

function member(overrides) {
  return {
    id: "member-id",
    authUserId: "auth-id",
    name: "기본 멤버",
    displayName: "기본 멤버",
    phone: "010-0000-0000",
    groupId: "group-a",
    groupName: "A순",
    role: "member",
    status: "active",
    email: "person@example.com",
    address: "Seattle",
    baptismStatus: "세례/입교",
    notes: "메모",
    customFields: { birthdate: "2000-01-01" },
    present: true,
    attendanceHistory: [{ eventId: "event", eventDate: "2026-05-29", title: "예배", status: "present", note: "", excuseStartDate: "", excuseEndDate: "" }],
    careFollowups: [{ id: "care", status: "needed", note: "연락", assignedToMemberId: null, assignedToName: "미배정", createdAt: "2026-05-29", completedAt: null }],
    ...overrides,
  };
}

const groups = [
  { id: "group-a", name: "A순", leaderMemberId: "soonjang", leaderName: "순장" },
  { id: "group-b", name: "B순", leaderMemberId: "other-leader", leaderName: "다른 순장" },
  { id: "leaders", name: "공동체 리더 순", leaderMemberId: null, leaderName: "미배정" },
];

const mixedMembers = [
  member({ id: "soonjang", name: "순장", displayName: "순장", groupId: "group-a", groupName: "A순", role: "staff" }),
  member({ id: "same-group", name: "같은 순", displayName: "같은 순", groupId: "group-a", groupName: "A순" }),
  member({ id: "other-group", name: "다른 순", displayName: "다른 순", groupId: "group-b", groupName: "B순" }),
  member({
    id: "community-leader",
    name: "교역자",
    displayName: "교역자",
    groupId: "leaders",
    groupName: "공동체 리더 순",
    customFields: { community_leader_role: "clergy" },
  }),
  member({
    id: "clergy-in-group",
    name: "이사야",
    displayName: "이사야",
    groupId: "group-b",
    groupName: "B순",
    customFields: { community_leader_role: "clergy" },
  }),
  member({ id: "inactive", name: "비활성", displayName: "비활성", status: "inactive", groupId: "group-b", groupName: "B순" }),
  member({ id: "merged-placeholder", name: "병합 잔여", displayName: "병합 잔여", email: "old@merged.local", groupId: null, groupName: "미배정" }),
];

test("soonjang has the same full-detail view as leader", () => {
  const scopedMembers = scopeMembersForRole({
    role: "staff",
    currentMemberId: "soonjang",
    groups,
    members: mixedMembers,
  });

  assert.equal(scopedMembers.find((item) => item.id === "same-group").phone, "010-0000-0000");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").name, "다른 순");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").phone, "010-0000-0000");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").email, "person@example.com");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").address, "Seattle");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").baptismStatus, "세례/입교");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").authUserId, "auth-id");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").role, "member");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").status, "active");
  assert.equal(scopedMembers.find((item) => item.id === "inactive").status, "inactive");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").present, true);
  assert.equal(scopedMembers.find((item) => item.id === "other-group").notes, "메모");
  assert.deepEqual({ ...scopedMembers.find((item) => item.id === "other-group").customFields }, { birthdate: "2000-01-01" });
  assert.deepEqual(Array.from(scopedMembers.find((item) => item.id === "other-group").attendanceHistory), mixedMembers.find((item) => item.id === "other-group").attendanceHistory);
  assert.deepEqual(Array.from(scopedMembers.find((item) => item.id === "other-group").careFollowups), mixedMembers.find((item) => item.id === "other-group").careFollowups);
});

test("all roles use the same visible roster basis without merged placeholders", () => {
  const expectedVisibleIds = ["soonjang", "same-group", "other-group", "community-leader", "clergy-in-group", "inactive"];

  for (const role of roles) {
    const scopedMembers = scopeMembersForRole({
      role,
      currentMemberId: role === "staff" ? "soonjang" : `${role}-user`,
      groups,
      members: mixedMembers,
    });

    assert.deepEqual(
      scopedMembers.map((item) => item.id),
      expectedVisibleIds,
      `${role} should see the same roster rows`,
    );
  }
});

test("welcome team can see community leader attendance details without opening other groups", () => {
  const scopedMembers = scopeMembersForRole({
    role: "welcome",
    currentMemberId: "welcome-user",
    groups,
    members: mixedMembers,
  });
  const communityLeader = scopedMembers.find((item) => item.id === "community-leader");
  const clergyInGroup = scopedMembers.find((item) => item.id === "clergy-in-group");
  const otherGroupMember = scopedMembers.find((item) => item.id === "other-group");

  assert.equal(communityLeader.phone, "010-0000-0000");
  assert.equal(communityLeader.customFields.community_leader_role, "clergy");
  assert.equal(communityLeader.present, true);
  assert.equal(clergyInGroup.phone, "010-0000-0000");
  assert.equal(clergyInGroup.customFields.community_leader_role, "clergy");
  assert.equal(clergyInGroup.present, true);
  assert.equal(otherGroupMember.phone, "비공개");
  assert.equal(otherGroupMember.email, "");
  assert.deepEqual(Array.from(otherGroupMember.attendanceHistory), []);
});

test("owner admin leader and soonjang roles keep the same full-detail view", () => {
  for (const role of ["owner", "admin", "leader", "staff"]) {
    const scopedMembers = scopeMembersForRole({
      role,
      currentMemberId: `${role}-user`,
      groups,
      members: mixedMembers,
    });
    const otherGroupMember = scopedMembers.find((item) => item.id === "other-group");

    assert.equal(otherGroupMember.phone, "010-0000-0000", `${role} should keep phone detail`);
    assert.equal(otherGroupMember.email, "person@example.com", `${role} should keep email detail`);
    assert.equal(otherGroupMember.address, "Seattle", `${role} should keep address detail`);
    assert.equal(otherGroupMember.present, true, `${role} should keep attendance detail`);
    assert.deepEqual(Array.from(otherGroupMember.attendanceHistory), mixedMembers.find((item) => item.id === "other-group").attendanceHistory);
    assert.deepEqual(Array.from(otherGroupMember.careFollowups), mixedMembers.find((item) => item.id === "other-group").careFollowups);
  }
});

test("member role only receives full detail for self", () => {
  const scopedMembers = scopeMembersForRole({
    role: "member",
    currentMemberId: "same-group",
    groups,
    members: mixedMembers,
  });
  const self = scopedMembers.find((item) => item.id === "same-group");
  const otherGroupMember = scopedMembers.find((item) => item.id === "other-group");

  assert.equal(self.phone, "010-0000-0000");
  assert.equal(self.email, "person@example.com");
  assert.equal(otherGroupMember.name, "다른 순");
  assert.equal(otherGroupMember.groupName, "B순");
  assert.equal(otherGroupMember.phone, "비공개");
  assert.equal(otherGroupMember.email, "");
  assert.equal(otherGroupMember.address, "비공개");
  assert.deepEqual(Array.from(otherGroupMember.attendanceHistory), []);
});

test("soonjang keeps full detail for self even outside assigned group", () => {
  const scopedMembers = scopeMembersForRole({
    role: "staff",
    currentMemberId: "soonjang",
    groups: [{ id: "group-a", name: "A순", leaderMemberId: "other-leader", leaderName: "다른 순장" }],
    members: [member({ id: "soonjang", groupId: "group-b", groupName: "B순", role: "staff" })],
  });

  assert.equal(scopedMembers[0].phone, "010-0000-0000");
  assert.equal(scopedMembers[0].email, "person@example.com");
});
