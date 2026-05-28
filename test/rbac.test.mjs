import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { getRoleForEmail } = loadTsModule("../src/lib/rbac.ts");

test("new logins always start with member role", () => {
  assert.equal(getRoleForEmail("new.person@example.com"), "member");
  assert.equal(getRoleForEmail("new.person+leader@example.com"), "member");
  assert.equal(getRoleForEmail(""), "member");
});
