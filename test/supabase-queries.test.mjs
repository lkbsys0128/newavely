import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");

test("dashboard member query disambiguates group and attendance embeds", () => {
  assert.match(dataSource, /groups!members_group_id_fkey\(name\)/);
  assert.match(dataSource, /attendance_records!attendance_records_member_id_fkey\(status\)/);
});

test("dashboard queries do not use known ambiguous embeds", () => {
  assert.doesNotMatch(dataSource, /[^!]groups\(name\)/);
  assert.doesNotMatch(dataSource, /[^!]attendance_records\(status\)/);
});

test("group leader query uses the explicit leader relationship", () => {
  assert.match(dataSource, /leader:members!groups_leader_member_id_fkey\(name\)/);
  assert.match(dataSource, /leader_member_id/);
});
