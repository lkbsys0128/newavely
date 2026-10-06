import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { canManagePrayer } = loadTsModule("../src/lib/prayer-access.ts");

test("only registered roster states can manage prayer, regardless of role", () => {
  for (const role of ["owner", "admin", "leader", "staff", "assistant", "welcome", "member"]) {
    for (const status of ["new", "inactive", "", "unknown", null]) assert.equal(canManagePrayer({ role, status }), false);
    for (const status of ["active", "care"]) assert.equal(canManagePrayer({ role, status }), true);
  }
  assert.equal(canManagePrayer(null), false);
  assert.equal(canManagePrayer(undefined), false);
});

test("page, save, and search consistently enforce registration before private operations", () => {
  for (const file of ["page.tsx", "actions.ts", "search-actions.ts"]) {
    const source = readFileSync(new URL(`../src/app/prayer/${file}`, import.meta.url), "utf8");
    assert.match(source, /canManagePrayer\(member\)/);
    assert.doesNotMatch(source, /member\.status [!=]== "inactive"/);
    if (file !== "page.tsx") assert.ok(source.indexOf("!canManagePrayer(member)") < source.indexOf("supabase.rpc("));
  }
});

test("migration protects direct RPC calls and history with a null-safe allowlist", () => {
  const sql = readFileSync(new URL("../db/044_prayer_registered_members.sql", import.meta.url), "utf8");
  assert.equal((sql.match(/coalesce\(current_member_status\(\) in \('active', 'care'\), false\)/g) ?? []).length, 3);
  assert.match(sql, /for update/);
  assert.match(sql, /record_audit_log/);
  assert.match(sql, /prior.version <> p_version/);
});
