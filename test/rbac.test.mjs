import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { getRoleForEmail, permissionsByRole, roles } = loadTsModule("../src/lib/rbac.ts");

test("new logins always start with member role", () => {
  assert.equal(getRoleForEmail("new.person@example.com"), "member");
  assert.equal(getRoleForEmail("new.person+leader@example.com"), "member");
  assert.equal(getRoleForEmail(""), "member");
});

test("owner sits above admin for privileged operations", () => {
  assert.deepEqual(Array.from(roles), ["owner", "admin", "leader", "staff", "member"]);
  assert(permissionsByRole.owner.includes("owner:manage"));
  assert(permissionsByRole.admin.includes("roles:manage"));
  assert.equal(permissionsByRole.admin.includes("owner:manage"), false);
});
