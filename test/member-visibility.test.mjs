import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { scopeMembersForRole } = loadTsModule("../src/lib/member-visibility.ts");

function member(overrides) {
  return {
    id: "member-id",
    authUserId: "auth-id",
    name: "기본 멤버",
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

test("soonjang sees full detail only for members in led groups", () => {
  const groups = [
    { id: "group-a", name: "A순", leaderMemberId: "soonjang", leaderName: "순장" },
    { id: "group-b", name: "B순", leaderMemberId: "other-leader", leaderName: "다른 순장" },
  ];
  const scopedMembers = scopeMembersForRole({
    role: "staff",
    currentMemberId: "soonjang",
    groups,
    members: [
      member({ id: "soonjang", name: "순장", groupId: "group-a" }),
      member({ id: "same-group", name: "같은 순", groupId: "group-a" }),
      member({ id: "other-group", name: "다른 순", groupId: "group-b" }),
    ],
  });

  assert.equal(scopedMembers.find((item) => item.id === "same-group").phone, "010-0000-0000");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").name, "다른 순");
  assert.equal(scopedMembers.find((item) => item.id === "other-group").phone, "비공개");
  assert.deepEqual({ ...scopedMembers.find((item) => item.id === "other-group").customFields }, {});
  assert.deepEqual(Array.from(scopedMembers.find((item) => item.id === "other-group").attendanceHistory), []);
});

test("all roles use the same visible roster basis without merged placeholders", () => {
  const groups = [{ id: "group-a", name: "A순", leaderMemberId: "soonjang", leaderName: "순장" }];
  const members = [
    member({ id: "real", name: "요셉", groupId: "group-a" }),
    member({ id: "merged-placeholder", name: "요셉", email: "merged-placeholder@merged.local", groupId: null }),
  ];

  const soonjangMembers = scopeMembersForRole({
    role: "staff",
    currentMemberId: "soonjang",
    groups,
    members,
  });
  const adminMembers = scopeMembersForRole({
    role: "admin",
    currentMemberId: "admin",
    groups,
    members,
  });

  assert.deepEqual(
    soonjangMembers.map((item) => item.id),
    ["real"],
  );
  assert.deepEqual(
    adminMembers.map((item) => item.id),
    ["real"],
  );
});

test("non-soonjang roles keep full member detail", () => {
  const [adminMember] = scopeMembersForRole({
    role: "admin",
    currentMemberId: "admin",
    groups: [],
    members: [member({ id: "other-group", groupId: "group-b" })],
  });

  assert.equal(adminMember.phone, "010-0000-0000");
  assert.equal(adminMember.email, "person@example.com");
});
