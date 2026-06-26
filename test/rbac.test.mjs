import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { getRoleForEmail, hasPermission, permissions, permissionsByRole, roles } = loadTsModule("../src/lib/rbac.ts");

test("new logins always start with member role", () => {
  assert.equal(getRoleForEmail("new.person@example.com"), "member");
  assert.equal(getRoleForEmail("new.person+leader@example.com"), "member");
  assert.equal(getRoleForEmail(""), "member");
});

test("owner sits above admin for privileged operations", () => {
  assert.deepEqual(Array.from(roles), ["owner", "admin", "leader", "staff", "assistant", "welcome", "member"]);
  assert(permissionsByRole.owner.includes("owner:manage"));
  assert(permissionsByRole.admin.includes("roles:manage"));
  assert.equal(permissionsByRole.admin.includes("owner:manage"), false);
});

test("important links can be added by soonjang and deleted by admins", () => {
  assert(permissionsByRole.staff.includes("links:write"));
  assert(permissionsByRole.leader.includes("links:write"));
  assert(permissionsByRole.admin.includes("links:write"));
  assert(permissionsByRole.member.includes("links:read"));
  assert.equal(permissionsByRole.member.includes("links:write"), false);
});

test("soonjang keeps the same app permissions as leader", () => {
  assert.deepEqual(permissionsByRole.staff, permissionsByRole.leader);
});

test("assistant can only help with attendance for their group", () => {
  assert(permissionsByRole.assistant.includes("members:read"));
  assert(permissionsByRole.assistant.includes("attendance:read"));
  assert(permissionsByRole.assistant.includes("attendance:write"));
  assert(permissionsByRole.assistant.includes("groups:read"));
  assert(permissionsByRole.assistant.includes("links:read"));
  assert.equal(permissionsByRole.assistant.includes("members:write"), false);
  assert.equal(permissionsByRole.assistant.includes("roles:manage"), false);
  assert.equal(permissionsByRole.assistant.includes("new-family:read"), false);
});

test("welcome team keeps member access plus new family read and write", () => {
  assert(permissionsByRole.welcome.includes("members:read"));
  assert(permissionsByRole.welcome.includes("attendance:read"));
  assert(permissionsByRole.welcome.includes("attendance:extras:read"));
  assert(permissionsByRole.welcome.includes("attendance:extras:write"));
  assert(permissionsByRole.welcome.includes("groups:read"));
  assert(permissionsByRole.welcome.includes("links:read"));
  assert(permissionsByRole.welcome.includes("new-family:read"));
  assert(permissionsByRole.welcome.includes("new-family:write"));
  assert.equal(permissionsByRole.welcome.includes("attendance:write"), false);
  assert.equal(permissionsByRole.welcome.includes("members:write"), false);
  assert.equal(permissionsByRole.welcome.includes("roles:manage"), false);
});

test("role permissions are enforced through hasPermission", () => {
  for (const permission of permissions) {
    assert.equal(hasPermission("owner", permission), true, `owner should have ${permission}`);
  }

  assert.equal(hasPermission("admin", "roles:manage"), true);
  assert.equal(hasPermission("admin", "owner:manage"), false);
  assert.equal(hasPermission("leader", "members:write"), true);
  assert.equal(hasPermission("staff", "members:write"), true);
  assert.equal(hasPermission("assistant", "attendance:write"), true);
  assert.equal(hasPermission("assistant", "members:write"), false);
  assert.equal(hasPermission("member", "members:write"), false);
  assert.equal(hasPermission("member", "new-family:read"), false);
  assert.equal(hasPermission("welcome", "new-family:read"), true);
  assert.equal(hasPermission("welcome", "new-family:write"), true);
  assert.equal(hasPermission("welcome", "attendance:read"), true);
  assert.equal(hasPermission("welcome", "attendance:extras:write"), true);
  assert.equal(hasPermission("welcome", "attendance:write"), false);
});
