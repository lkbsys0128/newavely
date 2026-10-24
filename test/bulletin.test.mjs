import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { canManageBulletin, bulletinImageType, validBulletinDate } = loadTsModule("../src/lib/bulletin.ts");
const { getVisibleNavItems } = loadTsModule("../src/lib/navigation.ts");
test("only registered admins and owners may publish; every role can view", () => {
  for (const role of ["owner", "admin", "leader", "staff", "assistant", "welcome", "member"]) {
    for (const status of ["active", "care", "new", "inactive"]) {
      assert.equal(canManageBulletin({ role, status }), ["owner", "admin"].includes(role) && ["active", "care"].includes(status));
    }
    assert.ok(getVisibleNavItems(role).some((item) => item.href === "/bulletin"));
  }
  assert.equal(canManageBulletin(null), false);
  assert.ok(getVisibleNavItems(null).some((item) => item.href === "/bulletin"));
});
test("image signatures and actual dates are validated", () => {
  assert.equal(bulletinImageType(new Uint8Array([137,80,78,71,13,10,26,10])), "image/png");
  assert.equal(bulletinImageType(new Uint8Array([255,216,255,224])), "image/jpeg");
  assert.equal(bulletinImageType(new TextEncoder().encode('<svg></svg>')), null);
  assert.equal(bulletinImageType(new Uint8Array()), null);
  assert.equal(validBulletinDate("2026-02-30"), false);
  assert.equal(validBulletinDate("2026-10-18"), true);
});
test("public bulletin uses a dedicated loader and private storage with versioned audited RPC", () => {
  const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
  const page = read("../src/app/bulletin/page.tsx");
  const sql = read("../db/050_public_bulletin.sql");
  assert.doesNotMatch(page, /getAppPageData|createServiceRoleClient/);
  assert.match(page, /get_public_bulletin/);
  assert.match(page, /createSignedUrl/);
  assert.match(sql, /'bulletins', 'bulletins', false, 3145728/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /coalesce\(prior.version, 0\) <> p_version/);
  assert.match(sql, /record_audit_log\('bulletin.publish'/);
  assert.ok(read("../db/schema.sql").includes(sql.trim()));
});
