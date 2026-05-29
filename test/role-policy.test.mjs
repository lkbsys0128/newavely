import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { canChangeMemberRole, canDeleteMemberRole, canUseDeleteActions, getRoleChangeBlockReason } = loadTsModule(
  "../src/lib/role-policy.ts",
);

test("role policy blocks demoting the final active admin", () => {
  assert.equal(
    canChangeMemberRole({
      actorRole: "owner",
      targetCurrentRole: "admin",
      nextRole: "leader",
      activeAdminCount: 1,
      activeOwnerCount: 1,
    }),
    false,
  );
  assert.match(
    getRoleChangeBlockReason({
      actorRole: "owner",
      targetCurrentRole: "admin",
      nextRole: "member",
      activeAdminCount: 1,
      activeOwnerCount: 1,
    }),
    /마지막 관리자/,
  );
});

test("role policy protects the owner tier", () => {
  assert.equal(
    canChangeMemberRole({
      actorRole: "admin",
      targetCurrentRole: "admin",
      nextRole: "owner",
      activeAdminCount: 2,
      activeOwnerCount: 1,
    }),
    false,
  );
  assert.match(
    getRoleChangeBlockReason({
      actorRole: "admin",
      targetCurrentRole: "owner",
      nextRole: "admin",
      activeAdminCount: 2,
      activeOwnerCount: 1,
    }),
    /최고 관리자/,
  );
  assert.equal(
    canChangeMemberRole({
      actorRole: "owner",
      targetCurrentRole: "owner",
      nextRole: "admin",
      activeAdminCount: 2,
      activeOwnerCount: 1,
    }),
    false,
  );
});

test("role policy allows safe role changes", () => {
  assert.equal(
    canChangeMemberRole({
      actorRole: "owner",
      targetCurrentRole: "admin",
      nextRole: "leader",
      activeAdminCount: 2,
      activeOwnerCount: 1,
    }),
    true,
  );
  assert.equal(
    canChangeMemberRole({
      actorRole: "owner",
      targetCurrentRole: "member",
      nextRole: "admin",
      activeAdminCount: 1,
      activeOwnerCount: 1,
    }),
    true,
  );
  assert.equal(
    canChangeMemberRole({
      actorRole: "owner",
      targetCurrentRole: "admin",
      nextRole: "owner",
      activeAdminCount: 1,
      activeOwnerCount: 1,
    }),
    true,
  );
});

test("delete policy allows only leader and above to delete lower roles", () => {
  assert.equal(canUseDeleteActions("leader"), true);
  assert.equal(canUseDeleteActions("staff"), false);
  assert.equal(canDeleteMemberRole({ actorRole: "leader", targetRole: "member" }), true);
  assert.equal(canDeleteMemberRole({ actorRole: "leader", targetRole: "staff" }), true);
  assert.equal(canDeleteMemberRole({ actorRole: "leader", targetRole: "leader" }), false);
  assert.equal(canDeleteMemberRole({ actorRole: "admin", targetRole: "leader" }), true);
  assert.equal(canDeleteMemberRole({ actorRole: "admin", targetRole: "owner" }), false);
  assert.equal(canDeleteMemberRole({ actorRole: "owner", targetRole: "admin" }), true);
});
