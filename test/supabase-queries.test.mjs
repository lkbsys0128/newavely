import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");

test("dashboard member query disambiguates group and attendance embeds", () => {
  assert.match(dataSource, /groups!members_group_id_fkey\(name\)/);
  assert.match(
    dataSource,
    /attendance_records!attendance_records_member_id_fkey\(event_id, status, note, excuse_start_date, excuse_end_date, attendance_events\(event_date, title\)\)/,
  );
  assert.match(dataSource, /care_followups!care_followups_member_id_fkey\(/);
  assert.match(dataSource, /assigned_to:members!care_followups_assigned_to_member_id_fkey\(name\)/);
});

test("dashboard queries do not use known ambiguous embeds", () => {
  assert.doesNotMatch(dataSource, /[^!]groups\(name\)/);
  assert.doesNotMatch(dataSource, /[^!]attendance_records\(/);
  assert.doesNotMatch(dataSource, /[^!]care_followups\(/);
});

test("group leader query uses the explicit leader relationship", () => {
  assert.match(dataSource, /leader:members!groups_leader_member_id_fkey\(name\)/);
  assert.match(dataSource, /leader_member_id/);
});
