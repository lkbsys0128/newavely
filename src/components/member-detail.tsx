"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createCustomFieldDefinition,
  updateMember,
  updateMemberCustomFields,
  type ActionState,
} from "@/app/actions";
import { hasPermission } from "@/lib/rbac";
import type { AppUser } from "@/lib/app-page-data";
import type { CustomFieldDefinition, Group, Member } from "@/lib/types";

const initialActionState: ActionState = { ok: false, message: "" };

export function MemberDetailPageContent({
  user,
  member,
  groups,
  customFieldDefinitions,
}: {
  user: AppUser;
  member: Member;
  groups: Group[];
  customFieldDefinitions: CustomFieldDefinition[];
}) {
  const canManageMembers = hasPermission(user.role, "members:write");
  const canManageDefinitions = hasPermission(user.role, "roles:manage");
  const [profileState, profileAction, isSavingProfile] = useActionState(updateMember, initialActionState);
  const [customFieldsState, customFieldsAction, isSavingCustomFields] = useActionState(
    updateMemberCustomFields,
    initialActionState,
  );
  const [definitionState, definitionAction, isCreatingDefinition] = useActionState(
    createCustomFieldDefinition,
    initialActionState,
  );

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">멤버 상세</p>
          <h1>{member.name}</h1>
          <p className="meta">
            {member.groupName} · {statusLabels[member.status]}
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="secondary-button" href="/members">
            목록
          </Link>
        </div>
      </header>

      <div className="detail-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>기본 정보</h2>
            <span>{canManageMembers ? "수정 가능" : "읽기 전용"}</span>
          </div>
          <form action={profileAction} className="management-form">
            <input name="id" type="hidden" value={member.id} />
            <label>
              이름
              <input name="name" required defaultValue={member.name} disabled={!canManageMembers} />
            </label>
            <label>
              이메일
              <input name="email" type="email" defaultValue={member.email} disabled={!canManageMembers} />
            </label>
            <label>
              연락처
              <input name="phone" required defaultValue={member.phone} disabled={!canManageMembers} />
            </label>
            <label>
              소그룹
              <select name="groupId" defaultValue={member.groupId ?? ""} disabled={!canManageMembers}>
                <option value="">미배정</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              역할
              <select name="role" defaultValue={member.role} disabled={!canManageMembers}>
                <option value="admin">관리자</option>
                <option value="leader">리더</option>
                <option value="staff">스태프</option>
                <option value="member">멤버</option>
              </select>
            </label>
            <label>
              상태
              <select name="status" defaultValue={member.status} disabled={!canManageMembers}>
                <option value="active">활동</option>
                <option value="new">새가족</option>
                <option value="care">돌봄 필요</option>
                <option value="inactive">비활성화</option>
              </select>
            </label>
            <label>
              주소
              <input name="address" defaultValue={member.address} disabled={!canManageMembers} />
            </label>
            <label>
              세례/등록
              <input name="baptismStatus" defaultValue={member.baptismStatus} disabled={!canManageMembers} />
            </label>
            <label className="full-width">
              돌봄 메모
              <textarea name="notes" defaultValue={member.notes} disabled={!canManageMembers} />
            </label>
            <div className="form-actions full-width">
              <ActionMessage state={profileState} />
              <button className="primary-button" type="submit" disabled={!canManageMembers || isSavingProfile}>
                저장
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>추가 정보</h2>
            <span>{customFieldDefinitions.length}개 항목</span>
          </div>
          <form action={customFieldsAction} className="management-form">
            <input name="id" type="hidden" value={member.id} />
            {customFieldDefinitions.map((field) => (
              <label key={field.id} className={field.fieldType === "boolean" ? "checkbox-label" : undefined}>
                {field.label}
                {field.isSensitive ? <span className="field-note">민감</span> : null}
                <CustomFieldInput field={field} value={member.customFields[field.key]} disabled={!canManageMembers} />
              </label>
            ))}
            {customFieldDefinitions.length === 0 ? (
              <article className="care-item full-width">
                <div className="person-block">
                  <strong>아직 추가 정보 항목이 없습니다</strong>
                  <span>아래에서 항목을 만들면 이 멤버에게 값을 입력할 수 있습니다.</span>
                </div>
              </article>
            ) : null}
            <div className="form-actions full-width">
              <ActionMessage state={customFieldsState} />
              <button
                className="primary-button"
                type="submit"
                disabled={!canManageMembers || isSavingCustomFields || customFieldDefinitions.length === 0}
              >
                추가 정보 저장
              </button>
            </div>
          </form>
        </section>
      </div>

      {canManageDefinitions ? (
        <section className="panel form-panel">
          <div className="panel-heading">
            <h2>새 정보 항목 만들기</h2>
            <span>모든 멤버 상세 페이지에 추가됩니다</span>
          </div>
          <form action={definitionAction} className="member-form compact-form">
            <label>
              항목 이름
              <input name="label" required placeholder="비상 연락처" />
            </label>
            <label>
              입력 방식
              <select name="fieldType" defaultValue="text">
                <option value="text">짧은 글</option>
                <option value="number">숫자</option>
                <option value="date">날짜</option>
                <option value="boolean">예/아니오</option>
              </select>
            </label>
            <label className="toggle-field">
              <input name="isSensitive" type="checkbox" />
              관리자만 볼 정보
            </label>
            <details className="advanced-field full-width">
              <summary>고급 설정</summary>
              <label>
                식별 키
                <input name="key" placeholder="비워두면 항목 이름으로 자동 생성" />
              </label>
            </details>
            <div className="form-actions full-width">
              <ActionMessage state={definitionState} />
              <button className="primary-button" type="submit" disabled={isCreatingDefinition}>
                항목 만들기
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}

function CustomFieldInput({
  field,
  value,
  disabled,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  disabled: boolean;
}) {
  const name = `custom_${field.key}`;

  if (field.fieldType === "boolean") {
    return (
      <>
        <input name={name} type="hidden" value="false" />
        <input name={name} type="checkbox" value="true" defaultChecked={Boolean(value)} disabled={disabled} />
      </>
    );
  }

  return (
    <input
      name={name}
      type={field.fieldType}
      defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      disabled={disabled}
    />
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p className={`action-message ${state.ok ? "success" : "error"}`} role="status">
      {state.message}
    </p>
  );
}

const statusLabels: Record<Member["status"], string> = {
  active: "활동",
  new: "새가족",
  care: "돌봄 필요",
  inactive: "비활성화",
};
