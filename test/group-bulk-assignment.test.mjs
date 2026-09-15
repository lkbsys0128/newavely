import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../db/040_bulk_group_assignment.sql");
const actions = read("../src/app/actions.ts");
const bulkAction = actions.slice(actions.indexOf("export async function bulkAssignGroupMembers"), actions.indexOf("export async function updateGroup"));
const { hasPermission, roles } = loadTsModule("../src/lib/rbac.ts");

test("only administrators can invoke bulk assignment through the action and RPC", () => {
  for (const role of roles) assert.equal(hasPermission(role, "groups:write"), ["owner", "admin"].includes(role));
  assert.match(bulkAction, /getAuthorizedCurrentMember\("groups:write"\)/);
  assert.match(sql, /current_member_role\(\) not in \('owner', 'admin'\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /revoke all on function[\s\S]*from public/);
});

test("bulk RPC locks, validates current membership and aborts partial updates", () => {
  assert.match(sql, /order by id for update/);
  assert.match(sql, /group_id = source_group_id or id = source_leader/);
  assert.match(sql, /count\(distinct id\)/);
  assert.match(sql, /jsonb_array_length\(before_rows\)[\s\S]*<> expected_count/);
  assert.match(sql, /get diagnostics changed_count = row_count/);
  assert.match(sql, /if changed_count <> expected_count then\s+raise exception/);
  assert.doesNotMatch(sql, /exception when|commit;/i);
});

test("moving a leader clears only the source designation and preserves roles and attendance", () => {
  assert.match(sql, /if source_leader = any\(selected_member_ids\) then/);
  assert.match(sql, /update groups set leader_member_id = null,[^;]*where id = source_group_id/);
  assert.doesNotMatch(sql, /set role|delete from|update attendance_records/i);
  assert.match(bulkAction, /group\.members\.bulk_assign/);
  assert.ok(read("../db/schema.sql").includes(sql.trim()));
});

test("bulk UI includes selection and an explicit destination without changing existing group forms", () => {
  const ui = read("../src/components/group-bulk-assignment.tsx");
  assert.match(ui, /name="memberIds"/);
  assert.match(ui, /member.id === group.leaderMemberId/);
  assert.match(ui, /name="targetGroupId"/);
  assert.match(ui, /pending \|\| currentIds.length === 0/);
  assert.match(ui, /전체 선택/);
  assert.match(ui, /role=\{state.ok \? "status" : "alert"\}/);
});
