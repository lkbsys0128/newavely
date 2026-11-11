import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

function expandFixture(path) {
  return readFileSync(path, "utf8").split("\n").map((line) => {
    const include = line.match(/^\\ir\s+(.+)$/);
    if (include) return expandFixture(resolve(dirname(path), include[1].trim()));
    if (/^\\(?:set|echo)\b/.test(line)) return "";
    return line;
  }).join("\n");
}

test("generation RPCs enforce ownership, scoped delegation, revocation, idempotency and conflicts in disposable PostgreSQL", { timeout: 120000 }, async () => {
  const db = new PGlite();
  try {
    const fixture = fileURLToPath(new URL("./sql/prayer-generation.sql", import.meta.url));
    await db.exec(expandFixture(fixture));
    const result = await db.query("select to_regclass('public.prayer_generation_requests') as remaining");
    assert.equal(result.rows[0].remaining, null, "all fixture data is rolled back");
  } finally { await db.close(); }
});
