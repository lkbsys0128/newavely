"use client";

import { useActionState, useState } from "react";
import { bulkAssignGroupMembers } from "@/app/actions";
import type { Group, Member } from "@/lib/types";

export function GroupBulkAssignment({ group, groups, members }: { group: Group; groups: Group[]; members: Member[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [state, action, pending] = useActionState(bulkAssignGroupMembers, { ok: false, message: "" });
  const currentIds = selected.filter((id) => members.some((member) => member.id === id));
  const allSelected = members.length > 0 && currentIds.length === members.length;
  return (
    <details className="group-bulk-assignment">
      <summary>멤버 일괄 배정</summary>
      <form action={action} className="management-form">
        <input name="sourceGroupId" type="hidden" value={group.id} />
        <fieldset disabled={pending} className="group-bulk-members">
          <legend>이동할 멤버</legend>
          <label className="group-bulk-choice">
            <input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? members.map((member) => member.id) : [])} />
            <span>전체 선택 ({members.length}명)</span>
          </label>
          <div className="group-bulk-options">
            {members.map((member) => (
              <label key={member.id} className="group-bulk-choice">
                <input type="checkbox" name="memberIds" value={member.id} checked={currentIds.includes(member.id)}
                  onChange={(event) => setSelected(event.target.checked ? [...currentIds, member.id] : currentIds.filter((id) => id !== member.id))} />
                <span>{member.displayName}{member.id === group.leaderMemberId ? " · 순장" : ""}{member.status === "inactive" ? " · 비활성" : ""}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>배정할 순
          <select name="targetGroupId" value={target} disabled={pending} onChange={(event) => setTarget(event.target.value)}>
            <option value="">미배정</option>
            {groups.filter((item) => item.id !== group.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <p className="meta">선택한 순장이 이동하면 기존 순의 순장 지정이 해제됩니다. 개인 역할과 대상 순의 순장은 유지됩니다.</p>
        <button className="primary-button" disabled={pending || currentIds.length === 0} type="submit">
          {pending ? "변경 중" : `${currentIds.length}명 ${groups.find((item) => item.id === target)?.name ?? "미배정"}으로 이동`}
        </button>
        {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
      </form>
    </details>
  );
}
