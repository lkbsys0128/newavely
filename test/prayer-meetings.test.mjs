import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { prayerMeetingSchema } = loadTsModule("../src/lib/prayer-meetings.ts");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("prayer orders validate real dates, bounded rows and required titles", () => {
  const valid = { id: null, version: 0, eventDate: "2026-09-16", entries: [{ title: "오프닝 기도", detail: "" }] };
  assert.equal(prayerMeetingSchema.safeParse(valid).success, true);
  for (const patch of [{ eventDate: "2026-02-30" }, { entries: [] }, { entries: [{ title: "   " }] }, { version: -1 }, { entries: Array(101).fill(valid.entries[0]) }]) {
    assert.equal(prayerMeetingSchema.safeParse({ ...valid, ...patch }).success, false);
  }
});

test("anonymous prayer query is parameterless and history remains authenticated", () => {
  const page = read("../src/app/prayer/page.tsx");
  assert.match(page, /if \(canEdit\)/);
  assert.match(page, /supabase.rpc\("get_latest_prayer_meeting"\)/);
  assert.match(page, /dynamic = "force-dynamic"/);
  const sql = read("../db/041_prayer_meetings.sql");
  assert.match(sql, /order by event_date desc limit 1/);
  assert.match(sql, /revoke all on public.prayer_meetings from anon, authenticated/);
  assert.match(sql, /grant select on public.prayer_meetings to authenticated/);
  assert.match(sql, /prior.version <> p_version/);
  assert.match(sql, /perform record_audit_log/);
  assert.ok(read("../db/schema.sql").includes(sql.trim()));
});

test("prayer and links are available in unauthenticated navigation", () => {
  const nav = read("../src/lib/navigation.ts");
  assert.match(nav, /href: "\/calendar", label: "캘린더" \},\s*\{ href: "\/prayer", label: "오늘의 기도회", public: true/);
  assert.match(nav, /if \(!role\) return navItems.filter\(\(item\) => item.public\)/);
  assert.match(nav, /href: "\/links", label: "링크", requiredPermission: "links:read", public: true/);
  assert.equal((nav.match(/public: true/g) ?? []).length, 2);
});
