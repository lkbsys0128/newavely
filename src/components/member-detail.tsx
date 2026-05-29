"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SectionNav } from "@/components/section-nav";
import { DisclosurePanel } from "@/components/disclosure-panel";
import {
  createCareFollowup,
  createCustomFieldDefinition,
  createMemberLinkRequest,
  deleteCustomFieldDefinition,
  updateCareFollowup,
  updateMember,
  updateMemberCustomFields,
  updateCustomFieldDefinition,
  type ActionState,
} from "@/app/actions";
import { hasPermission } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { isActionableLinkRequest } from "@/lib/member-link-requests";
import {
  appendCurrentOption,
  baptismStatusOptions,
  calculateKoreanAge,
  genderOptions,
  jobOptions,
  ministryOptions,
  normalizeBaptismStatus,
  normalizeJobValue,
  normalizeMinistryValue,
} from "@/lib/member-field-options";
import type { AppUser } from "@/lib/app-page-data";
import type { CustomFieldDefinition, Group, Member, MemberLinkRequest } from "@/lib/types";

const initialActionState: ActionState = { ok: false, message: "" };

export function MemberDetailPageContent({
  user,
  member,
  groups,
  members,
  customFieldDefinitions,
  memberLinkRequests = [],
  eyebrow = "멤버 상세",
  backHref = "/members",
  backLabel = "목록",
  showLinkRequest = false,
}: {
  user: AppUser;
  member: Member;
  groups: Group[];
  members: Member[];
  customFieldDefinitions: CustomFieldDefinition[];
  memberLinkRequests?: MemberLinkRequest[];
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
  showLinkRequest?: boolean;
}) {
  const canManageMembers = hasPermission(user.role, "members:write");
  const canManageDefinitions = hasPermission(user.role, "roles:manage");
  const canManageRoles = hasPermission(user.role, "roles:manage");
  const assignableRoleEntries = getAssignableRoleEntries(user.role);
  const assignableMembers = members.filter((item) => item.status !== "inactive");
  const currentMemberId =
    assignableMembers.find((item) => item.authUserId === user.id)?.id ??
    assignableMembers.find((item) => item.email === user.email)?.id ??
    "";
  const [profileState, profileAction, isSavingProfile] = useActionState(updateMember, initialActionState);
  const [customFieldsState, customFieldsAction, isSavingCustomFields] = useActionState(
    updateMemberCustomFields,
    initialActionState,
  );
  const [definitionState, definitionAction, isCreatingDefinition] = useActionState(
    createCustomFieldDefinition,
    initialActionState,
  );
  const [updateDefinitionState, updateDefinitionAction, isUpdatingDefinition] = useActionState(
    updateCustomFieldDefinition,
    initialActionState,
  );
  const [deleteDefinitionState, deleteDefinitionAction, isDeletingDefinition] = useActionState(
    deleteCustomFieldDefinition,
    initialActionState,
  );
  const [createFollowupState, createFollowupAction, isCreatingFollowup] = useActionState(
    createCareFollowup,
    initialActionState,
  );
  const [linkRequestState, linkRequestAction, isCreatingLinkRequest] = useActionState(
    createMemberLinkRequest,
    initialActionState,
  );
  const [updateFollowupState, updateFollowupAction, isUpdatingFollowup] = useActionState(
    updateCareFollowup,
    initialActionState,
  );
  const googleAccountName =
    typeof member.customFields.google_account_name === "string" ? member.customFields.google_account_name : "";
  const currentMemberLinkRequests = memberLinkRequests.filter((request) => request.requesterMemberId === member.id);
  const pendingLinkRequest = currentMemberLinkRequests.find(isActionableLinkRequest);
  const rejectedLinkRequest = currentMemberLinkRequests.find((request) => request.status === "rejected");
  const linkableMembers = members.filter((item) => item.id !== member.id && !item.authUserId && item.status !== "inactive");
  const sectionItems = [
    ...(showLinkRequest ? [{ href: "#account-link", label: "계정 연결" }] : []),
    { href: "#basic-info", label: "기본 정보" },
    { href: "#custom-fields", label: "추가 정보" },
    { href: "#attendance-history", label: "출석 기록" },
    { href: "#care-followups", label: "돌봄" },
    ...(canManageDefinitions ? [{ href: "#custom-field-definitions", label: "정보 항목" }] : []),
  ];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{member.name}</h1>
          <p className="meta">
            {member.groupName} · {statusLabels[member.status]}
            {googleAccountName ? ` · Google 이름 ${googleAccountName}` : ""}
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="secondary-button" href={backHref}>
            {backLabel}
          </Link>
        </div>
      </header>
      <SectionNav items={sectionItems} />

      {showLinkRequest ? (
        <section className="panel form-panel" id="account-link">
          <div className="panel-heading">
            <div>
              <h2>기존 교적 멤버와 연결</h2>
              <p className="meta">CSV로 이미 등록된 내 교적 정보가 있으면 관리자에게 연결을 요청하세요.</p>
            </div>
            <span>{pendingLinkRequest ? "승인 대기 중" : "첫 로그인 설정"}</span>
          </div>
          {pendingLinkRequest ? (
            <article className="detail-row">
              <div className="person-block">
                <strong>{pendingLinkRequest.targetName}</strong>
                <span>관리자 승인 후 이 프로필로 교적 정보가 병합됩니다.</span>
              </div>
              <span className="status-pill">대기</span>
            </article>
          ) : rejectedLinkRequest ? (
            <article className="detail-row rejected-state">
              <div className="person-block">
                <strong>교적 연결 요청이 거절되었습니다</strong>
                <span>계정 연결이 필요하면 Newave 운영 관리자에게 직접 연락해주세요.</span>
              </div>
              <span className="status-pill">거절</span>
            </article>
          ) : (
            <form action={linkRequestAction} className="member-form account-link-form">
              <label>
                연결할 교적 멤버
                <select name="targetMemberId" disabled={linkableMembers.length === 0}>
                  {linkableMembers.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} · {candidate.groupName} · {candidate.email || "이메일 없음"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                메모
                <input name="note" placeholder="예: 제가 이 멤버입니다" />
              </label>
              <div className="form-actions">
                <ActionMessage state={linkRequestState} />
                <button className="primary-button" type="submit" disabled={isCreatingLinkRequest || linkableMembers.length === 0}>
                  연결 요청
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <div className="detail-layout">
        <section className="panel" id="basic-info">
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
              <select name="role" defaultValue={member.role} disabled={!canManageRoles}>
                {assignableRoleEntries.map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
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
              <BaptismStatusSelect value={member.baptismStatus} disabled={!canManageMembers} />
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

        <section className="panel" id="custom-fields">
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
                <CustomFieldInput
                  field={field}
                  value={member.customFields[field.key]}
                  customFields={member.customFields}
                  disabled={!canManageMembers}
                />
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

      <DisclosurePanel id="attendance-history" title="최근 출석 기록" meta={`${member.attendanceHistory.length}건`}>
        <div className="attendance-history">
          {member.attendanceHistory.slice(0, 8).map((record) => (
            <article className="history-row" key={record.eventId}>
              <div className="person-block">
                <strong>{record.title}</strong>
                <span>
                  {record.eventDate}
                  {record.excuseStartDate || record.excuseEndDate
                    ? ` · ${record.excuseStartDate || "시작일 미입력"} - ${record.excuseEndDate || "종료일 미입력"}`
                    : ""}
                </span>
                {record.note ? <span>사유: {record.note}</span> : null}
              </div>
              <span className={`attendance-pill ${record.status}`}>
                {attendanceStatusLabels[record.status]}
              </span>
            </article>
          ))}
          {member.attendanceHistory.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>아직 출석 기록이 없습니다</strong>
                <span>출석 페이지에서 이벤트를 선택하고 체크하면 여기에 표시됩니다.</span>
              </div>
            </article>
          ) : null}
        </div>
      </DisclosurePanel>

      <section className="panel form-panel" id="care-followups">
        <div className="panel-heading">
          <h2>돌봄 팔로업</h2>
          <span>{member.careFollowups.length}건</span>
        </div>
        <div className="definition-list">
          {member.careFollowups.map((followup) => (
            <article className="definition-row" key={followup.id}>
              <form action={updateFollowupAction} className="management-form">
                <input name="id" type="hidden" value={followup.id} />
                <input name="memberId" type="hidden" value={member.id} />
                <label>
                  상태
                  <select name="status" defaultValue={followup.status} disabled={!canManageMembers}>
                    {Object.entries(careFollowupStatusLabels).map(([status, label]) => (
                      <option key={status} value={status}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  담당자
                  <select
                    name="assignedToMemberId"
                    defaultValue={followup.assignedToMemberId ?? ""}
                    disabled={!canManageMembers}
                  >
                    <option value="">미배정</option>
                    {assignableMembers.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full-width">
                  메모
                  <textarea name="note" required defaultValue={followup.note} disabled={!canManageMembers} />
                </label>
                <div className="person-block">
                  <strong>{careFollowupStatusLabels[followup.status]}</strong>
                  <span>
                    담당 {followup.assignedToName} · {new Date(followup.createdAt).toLocaleString("ko-KR")}
                    {followup.completedAt ? ` · 완료 ${new Date(followup.completedAt).toLocaleString("ko-KR")}` : ""}
                  </span>
                </div>
                <div className="form-actions">
                  <ActionMessage state={updateFollowupState} />
                  <button className="secondary-button" type="submit" disabled={!canManageMembers || isUpdatingFollowup}>
                    저장
                  </button>
                </div>
              </form>
            </article>
          ))}
          {member.careFollowups.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>아직 팔로업 기록이 없습니다</strong>
                <span>출석, 사유, 돌봄 대화 후 필요한 액션을 기록해두세요.</span>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <DisclosurePanel title="새 팔로업 추가" meta={canManageMembers ? "담당자와 상태를 기록" : "읽기 전용"}>
        <form action={createFollowupAction} className="management-form">
          <input name="memberId" type="hidden" value={member.id} />
          <label>
            상태
            <select name="status" defaultValue="needed" disabled={!canManageMembers}>
              {Object.entries(careFollowupStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            담당자
            <select name="assignedToMemberId" defaultValue={currentMemberId} disabled={!canManageMembers}>
              <option value="">미배정</option>
              {assignableMembers.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="full-width">
            메모
            <textarea name="note" required placeholder="연락 필요, 대화 내용, 기도 제목 등" disabled={!canManageMembers} />
          </label>
          <div className="form-actions full-width">
            <ActionMessage state={createFollowupState} />
            <button className="primary-button" type="submit" disabled={!canManageMembers || isCreatingFollowup}>
              팔로업 추가
            </button>
          </div>
        </form>
      </DisclosurePanel>

      {canManageDefinitions ? (
        <>
          <DisclosurePanel id="custom-field-definitions" title="정보 항목 관리" meta="항목 이름과 공개 범위 수정">
            <div className="definition-list">
              {customFieldDefinitions.map((field) => (
                <article className="definition-row" key={field.id}>
                  <form action={updateDefinitionAction} className="management-form">
                    <input name="id" type="hidden" value={field.id} />
                    <input name="fieldType" type="hidden" value={field.fieldType} />
                    <label>
                      항목 이름
                      <input name="label" required defaultValue={field.label} />
                    </label>
                    <label className="toggle-field">
                      <input name="isSensitive" type="checkbox" defaultChecked={field.isSensitive} />
                      관리자만 볼 정보
                    </label>
                    <div className="form-actions full-width">
                      <ActionMessage state={updateDefinitionState} />
                      <button className="secondary-button" type="submit" disabled={isUpdatingDefinition}>
                        수정
                      </button>
                    </div>
                  </form>
                  <form action={deleteDefinitionAction} className="single-action-form compact-action-form">
                    <input name="id" type="hidden" value={field.id} />
                    <ActionMessage state={deleteDefinitionState} />
                    <button className="danger-button" type="submit" disabled={isDeletingDefinition}>
                      삭제
                    </button>
                  </form>
                </article>
              ))}
              {customFieldDefinitions.length === 0 ? (
                <article className="care-item">
                  <div className="person-block">
                    <strong>아직 관리할 항목이 없습니다</strong>
                    <span>아래에서 새 정보 항목을 먼저 만들어주세요.</span>
                  </div>
                </article>
              ) : null}
            </div>
          </DisclosurePanel>

          <DisclosurePanel title="새 정보 항목 만들기" meta="모든 멤버 상세 페이지에 추가됩니다">
            <form action={definitionAction} className="member-form compact-form">
              <input name="fieldType" type="hidden" value="text" />
              <label>
                항목 이름
                <input name="label" required placeholder="비상 연락처" />
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
          </DisclosurePanel>
        </>
      ) : null}
    </>
  );
}

function CustomFieldInput({
  field,
  value,
  customFields,
  disabled,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  customFields: Record<string, unknown>;
  disabled: boolean;
}) {
  const name = `custom_${field.key}`;

  if (field.key === "age") {
    const calculatedAge = calculateKoreanAge(customFields.birthdate);
    return (
      <>
        <input name={name} type="hidden" value={calculatedAge} />
        <input type="text" value={calculatedAge ? `만 ${calculatedAge}세` : "생년월일 저장 후 자동 계산"} disabled />
      </>
    );
  }

  if (field.key === "gender") {
    return (
      <select name={name} defaultValue={typeof value === "string" ? value : ""} disabled={disabled}>
        <option value="">미입력</option>
        {genderOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.key === "job") {
    return <JobFieldInput name={name} value={value} disabled={disabled} />;
  }

  if (field.key === "ministry_1" || field.key === "ministry_2") {
    const normalizedValue = normalizeMinistryValue(value);
    return (
      <select name={name} defaultValue={normalizedValue} disabled={disabled}>
        <option value="">미입력</option>
        {appendCurrentOption(ministryOptions, normalizedValue).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

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

function JobFieldInput({ name, value, disabled }: { name: string; value: unknown; disabled: boolean }) {
  const normalizedValue = normalizeJobValue(value);
  const initialChoice = normalizedValue
    ? jobOptions.includes(normalizedValue as (typeof jobOptions)[number])
      ? normalizedValue
      : "기타"
    : "";
  const [choice, setChoice] = useState(initialChoice);
  const [otherValue, setOtherValue] = useState(initialChoice === "기타" ? normalizedValue : "");
  const submittedValue = choice === "기타" ? otherValue : choice;

  return (
    <>
      <input name={name} type="hidden" value={submittedValue} />
      <select value={choice} onChange={(event) => setChoice(event.target.value)} disabled={disabled}>
        <option value="">미입력</option>
        {jobOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {choice === "기타" ? (
        <input
          value={otherValue}
          onChange={(event) => setOtherValue(event.target.value)}
          placeholder="직업 직접 입력"
          disabled={disabled}
        />
      ) : null}
    </>
  );
}

function BaptismStatusSelect({ value, disabled }: { value: unknown; disabled: boolean }) {
  const normalizedValue = normalizeBaptismStatus(value);

  return (
    <select name="baptismStatus" defaultValue={normalizedValue} disabled={disabled}>
      <option value="">미입력</option>
      {baptismStatusOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
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

const attendanceStatusLabels = {
  present: "출석",
  absent: "미출석",
  excused: "사유 있음",
};

const careFollowupStatusLabels = {
  needed: "필요",
  contacted: "연락 완료",
  prayer: "기도 요청",
  resolved: "해결",
};

const roleLabels: Record<Role, string> = {
  owner: "최고 관리자",
  admin: "관리자",
  leader: "리더",
  staff: "스태프",
  member: "멤버",
};

function getAssignableRoleEntries(actorRole: Role): Array<[Role, string]> {
  return (Object.entries(roleLabels) as Array<[Role, string]>).filter(([role]) => actorRole === "owner" || role !== "owner");
}
