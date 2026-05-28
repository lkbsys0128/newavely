import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { canChangeMemberRole, getRoleChangeBlockReason } = loadTsModule("../src/lib/role-policy.ts");

test("role policy blocks demoting the final active admin", () => {
  assert.equal(
    canChangeMemberRole({
      targetCurrentRole: "admin",
      nextRole: "leader",
      activeAdminCount: 1,
    }),
    false,
  );
  assert.match(
    getRoleChangeBlockReason({
      targetCurrentRole: "admin",
      nextRole: "member",
      activeAdminCount: 1,
    }),
    /마지막 관리자/,
  );
});

test("role policy allows safe role changes", () => {
  assert.equal(
    canChangeMemberRole({
      targetCurrentRole: "admin",
      nextRole: "leader",
      activeAdminCount: 2,
    }),
    true,
  );
  assert.equal(
    canChangeMemberRole({
      targetCurrentRole: "member",
      nextRole: "admin",
      activeAdminCount: 1,
    }),
    true,
  );
});
