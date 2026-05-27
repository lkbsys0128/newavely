"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createGroup,
  createMember,
  deactivateMember,
  reactivateMember,
  toggleAttendance,
  updateGroup,
  updateMember,
  type ActionState,
} from "@/app/actions";
import { hasPermission, permissionsByRole, type Role } from "@/lib/rbac";
import type { AppUser } from "@/lib/app-page-data";
import type { AuditLog, Group, Member } from "@/lib/types";

type AppDataProps = {
  user: AppUser;
  members: Member[];
  groups: Group[];
};

const initialActionState: ActionState = { ok: false, message: "" };

export function DashboardOverview({ user, members, groups }: AppDataProps) {
  const presentCount = members.filter((member) => member.present).length;
  const attendanceRate = members.length ? Math.round((presentCount / members.length) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="2026 공동체 관리 MVP" title="대시보드" user={user} />

      <div className="metric-grid">
        <article className="metric-card">
          <span>전체 멤버</span>
          <strong>{members.length}</strong>
          <small>목표 규모 200명 기준</small>
        </article>
        <article className="metric-card">
          <span>이번 주 출석</span>
          <strong>{attendanceRate}%</strong>
          <small>
            {presentCount}/{members.length}명 출석
          </small>
        </article>
        <article className="metric-card">
          <span>소그룹</span>
          <strong>{groups.length}</strong>
          <small>리더 배정 완료</small>
        </article>
        <article className="metric-card">
          <span>관리 역할</span>
          <strong>{Object.keys(permissionsByRole).length}</strong>
          <small>권한 단계</small>
        </article>
      </div>

      <div className="dashboard-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>오늘 챙길 멤버</h2>
            <span>새가족, 돌봄 필요, 결석</span>
          </div>
          <div className="care-list">
            {members
              .filter((member) => member.status !== "active" || !member.present)
              .map((member) => (
                <article className="care-item" key={member.id}>
                  <div className="person-block">
                    <strong>{member.name}</strong>
                    <span>
                      {member.groupName} · {member.notes}
                    </span>
                  </div>
                  <span className={`status-pill ${member.status === "active" ? "active" : ""}`}>
                    {statusLabels[member.status]}
                  </span>
                </article>
              ))}
          </div>
        </section>

        <GroupSummaryPanel members={members} groups={groups} />
      </div>
    </>
  );
}

export function MembersManager({ user, members, groups }: AppDataProps) {
  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? "");
  const [showInactive, setShowInactive] = useState(false);
  const [createMemberState, createMemberAction, isCreatingMember] = useActionState(createMember, initialActionState);
  const [updateMemberState, updateMemberAction, isUpdatingMember] = useActionState(updateMember, initialActionState);
  const [deactivateMemberState, deactivateMemberAction, isDeactivatingMember] = useActionState(
    deactivateMember,
    initialActionState,
  );
  const [reactivateMemberState, reactivateMemberAction, isReactivatingMember] = useActionState(
    reactivateMember,
    initialActionState,
  );
  const canManageMembers = hasPermission(user.role, "members:write");
  const visibleMembers = showInactive ? members : members.filter((member) => member.status !== "inactive");
  const selectedMember =
    visibleMembers.find((member) => member.id === selectedMemberId) ?? visibleMembers[0] ?? members[0];
  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return visibleMembers;
    return visibleMembers.filter((member) =>
      [member.name, member.phone, member.groupName, member.role, member.status]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [visibleMembers, query]);

  return (
    <>
      <PageHeader eyebrow="멤버 관리" title="멤버" user={user}>
        <label className="search-field">
          <span>검색</span>
          <input
            type="search"
            placeholder="이름, 연락처, 소그룹"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          비활성화 포함
        </label>
      </PageHeader>

      <section className="content-grid">
        <section className="panel wide">
          <div className="panel-heading">
            <h2>멤버 목록</h2>
            <span>{filteredMembers.length}명</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>소그룹</th>
                  <th>역할</th>
                  <th>상태</th>
                  <th>연락처</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} onClick={() => setSelectedMemberId(member.id)}>
                    <td>
                      <strong>{member.name}</strong>
                      <div className="meta">{member.email}</div>
                    </td>
                    <td>{member.groupName}</td>
                    <td>
                      <span className="role-pill">{roleLabels[member.role]}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${member.status === "active" ? "active" : ""}`}>
                        {statusLabels[member.status]}
                      </span>
                    </td>
                    <td>{member.phone}</td>
                    <td>
                      <Link className="secondary-button table-action" href={`/members/${member.id}`}>
                        열기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel">
          <div className="panel-heading">
            <h2>멤버 상세</h2>
            <span>{selectedMember ? statusLabels[selectedMember.status] : "선택 없음"}</span>
          </div>
          {selectedMember ? (
            <form action={updateMemberAction} className="management-form" key={selectedMember.id}>
              <input name="id" type="hidden" value={selectedMember.id} />
              <label>
                이름
                <input name="name" required defaultValue={selectedMember.name} disabled={!canManageMembers} />
              </label>
              <label>
                이메일
                <input name="email" type="email" defaultValue={selectedMember.email} disabled={!canManageMembers} />
              </label>
              <label>
                연락처
                <input name="phone" required defaultValue={selectedMember.phone} disabled={!canManageMembers} />
              </label>
              <label>
                소그룹
                <select name="groupId" defaultValue={selectedMember.groupId ?? ""} disabled={!canManageMembers}>
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
                <select name="role" defaultValue={selectedMember.role} disabled={!canManageMembers}>
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                상태
                <select name="status" defaultValue={selectedMember.status} disabled={!canManageMembers}>
                  <option value="active">활동</option>
                  <option value="new">새가족</option>
                  <option value="care">돌봄 필요</option>
                  <option value="inactive">비활성화</option>
                </select>
              </label>
              <label>
                주소
                <input name="address" defaultValue={selectedMember.address} disabled={!canManageMembers} />
              </label>
              <label>
                세례/등록
                <input name="baptismStatus" defaultValue={selectedMember.baptismStatus} disabled={!canManageMembers} />
              </label>
              <label className="full-width">
                커스텀 메모
                <textarea name="notes" defaultValue={selectedMember.notes} disabled={!canManageMembers} />
              </label>
              <div className="form-actions full-width">
                <ActionMessage state={updateMemberState} />
                <button className="primary-button" type="submit" disabled={!canManageMembers || isUpdatingMember}>
                  저장
                </button>
              </div>
            </form>
          ) : null}
          {selectedMember ? (
            <form action={deactivateMemberAction} className="single-action-form">
              <input name="id" type="hidden" value={selectedMember.id} />
              <ActionMessage state={deactivateMemberState} />
              <button
                className="danger-button"
                type="submit"
                disabled={!canManageMembers || selectedMember.status === "inactive" || isDeactivatingMember}
              >
                비활성화
              </button>
            </form>
          ) : null}
          {selectedMember?.status === "inactive" ? (
            <form action={reactivateMemberAction} className="single-action-form">
              <input name="id" type="hidden" value={selectedMember.id} />
              <ActionMessage state={reactivateMemberState} />
              <button className="primary-button" type="submit" disabled={!canManageMembers || isReactivatingMember}>
                다시 활성화
              </button>
            </form>
          ) : null}
        </aside>
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>멤버 추가</h2>
          <span>{canManageMembers ? "필수 정보만 먼저 입력" : "관리자/리더 권한 필요"}</span>
        </div>
        <form action={createMemberAction} className="member-form">
          <label>
            이름
            <input name="name" required placeholder="예: 김하은" disabled={!canManageMembers} />
          </label>
          <label>
            연락처
            <input name="phone" required placeholder="010-0000-0000" disabled={!canManageMembers} />
          </label>
          <label>
            이메일
            <input name="email" type="email" placeholder="name@example.com" disabled={!canManageMembers} />
          </label>
          <label>
            소그룹
            <select name="groupId" disabled={!canManageMembers}>
              <option value="">미배정</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            주소
            <input name="address" placeholder="주소" disabled={!canManageMembers} />
          </label>
          <label>
            세례/등록
            <input name="baptismStatus" placeholder="등록교인, 세례 등" disabled={!canManageMembers} />
          </label>
          <label>
            메모
            <input name="notes" placeholder="돌봄 메모" disabled={!canManageMembers} />
          </label>
          <label>
            역할
            <select name="role" disabled={!canManageMembers}>
              {Object.entries(roleLabels).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            상태
            <select name="status" disabled={!canManageMembers}>
              <option value="active">활동</option>
              <option value="new">새가족</option>
              <option value="care">돌봄 필요</option>
            </select>
          </label>
          <div className="form-actions full-width">
            <ActionMessage state={createMemberState} />
            <button className="primary-button" type="submit" disabled={!canManageMembers || isCreatingMember}>
            추가
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

export function GroupsPageContent({ user, members, groups }: AppDataProps) {
  const canManageGroups = hasPermission(user.role, "groups:write");
  const [createGroupState, createGroupAction, isCreatingGroup] = useActionState(createGroup, initialActionState);
  const [updateGroupState, updateGroupAction, isUpdatingGroup] = useActionState(updateGroup, initialActionState);

  return (
    <>
      <PageHeader eyebrow="소그룹 관리" title="소그룹" user={user} />
      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>소그룹 추가</h2>
          <span>{canManageGroups ? "이름, 리더, 목표 인원 설정" : "관리자 권한 필요"}</span>
        </div>
        <form action={createGroupAction} className="member-form compact-form">
          <label>
            소그룹 이름
            <input name="name" required placeholder="예: 믿음 1그룹" disabled={!canManageGroups} />
          </label>
          <label>
            리더
            <select name="leaderMemberId" disabled={!canManageGroups}>
              <option value="">미배정</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            목표 인원
            <input name="targetSize" type="number" min="1" max="500" defaultValue="12" disabled={!canManageGroups} />
          </label>
          <div className="form-actions full-width">
            <ActionMessage state={createGroupState} />
            <button className="primary-button" type="submit" disabled={!canManageGroups || isCreatingGroup}>
              추가
            </button>
          </div>
        </form>
      </section>

      <section className="group-grid">
        {groups.map((group) => {
          const groupMembers = members.filter((member) => member.groupName === group.name);
          const fill = group.targetSize ? Math.min(Math.round((groupMembers.length / group.targetSize) * 100), 100) : 0;
          return (
            <article className="group-card" key={group.id}>
              <header>
                <div>
                  <h2>{group.name}</h2>
                  <p className="meta">리더 {group.leaderName}</p>
                </div>
                <span className="role-pill">{groupMembers.length}명</span>
              </header>
              <div>
                <div className="progress" aria-label={`${group.name} 목표 인원 대비 ${fill}%`}>
                  <span style={{ width: `${fill}%` }} />
                </div>
                <p className="meta">목표 {group.targetSize}명</p>
              </div>
              <form action={updateGroupAction} className="management-form group-edit-form">
                <input name="id" type="hidden" value={group.id} />
                <label>
                  이름
                  <input name="name" required defaultValue={group.name} disabled={!canManageGroups} />
                </label>
                <label>
                  리더
                  <select name="leaderMemberId" defaultValue={group.leaderMemberId ?? ""} disabled={!canManageGroups}>
                    <option value="">미배정</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  목표 인원
                  <input
                    name="targetSize"
                    type="number"
                    min="1"
                    max="500"
                    defaultValue={group.targetSize}
                    disabled={!canManageGroups}
                  />
                </label>
                <ActionMessage state={updateGroupState} />
                <button className="secondary-button" type="submit" disabled={!canManageGroups || isUpdatingGroup}>
                  저장
                </button>
              </form>
            </article>
          );
        })}
      </section>
      <div className="section-spacer">
        <GroupSummaryPanel members={members} groups={groups} />
      </div>
    </>
  );
}

export function AttendanceManager({
  user,
  attendanceDate,
  attendanceEventId,
  members,
}: AppDataProps & { attendanceDate: string; attendanceEventId?: string }) {
  const [localMembers, setLocalMembers] = useState(members);
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | "present" | "absent">("all");
  const [isPending, startTransition] = useTransition();
  const canManageAttendance = hasPermission(user.role, "attendance:write");
  const attendanceMembers = localMembers.filter((member) => {
    if (attendanceFilter === "present") return member.present;
    if (attendanceFilter === "absent") return !member.present;
    return true;
  });

  return (
    <>
      <PageHeader eyebrow="출석 관리" title="출석" user={user} />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>주일 출석 체크</h2>
            <span>{attendanceDate}</span>
          </div>
          <div className="segmented">
            {(["all", "present", "absent"] as const).map((filter) => (
              <button
                className={`segment ${attendanceFilter === filter ? "active" : ""}`}
                key={filter}
                onClick={() => setAttendanceFilter(filter)}
                type="button"
              >
                {attendanceFilterLabels[filter]}
              </button>
            ))}
          </div>
        </div>
        <div className="attendance-list">
          {attendanceMembers.map((member) => (
            <article className="attendance-row" key={member.id}>
              <div className="person-block">
                <strong>{member.name}</strong>
                <span>
                  {member.groupName} · {member.phone}
                </span>
              </div>
              <span className={`attendance-pill ${member.present ? "present" : ""}`}>
                {member.present ? "출석" : "미출석"}
              </span>
              <button
                className={member.present ? "secondary-button" : "primary-button"}
                disabled={!canManageAttendance || !attendanceEventId || isPending}
                onClick={() => {
                  if (!attendanceEventId) return;
                  setLocalMembers((current) =>
                    current.map((item) => (item.id === member.id ? { ...item, present: !item.present } : item)),
                  );
                  startTransition(() => {
                    void toggleAttendance(member.id, attendanceEventId, !member.present);
                  });
                }}
                type="button"
              >
                {member.present ? "미출석 처리" : "출석 체크"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function PermissionsPageContent({ user, members }: AppDataProps) {
  return (
    <>
      <PageHeader eyebrow="권한 관리" title="권한" user={user} />
      <section className="panel">
        <div className="panel-heading">
          <h2>역할 기반 권한</h2>
          <span>로그인한 사용자 역할에 따라 메뉴와 데이터 접근 제한</span>
        </div>
        <div className="permission-matrix">
          {Object.entries(permissionsByRole).map(([role, permissions]) => (
            <article className="permission-row" key={role}>
              <div className="person-block">
                <strong>{roleLabels[role as Role]}</strong>
                <span>{members.filter((member) => member.role === role).length}명 배정</span>
              </div>
              <div className="permission-list">
                {permissions.map((permission) => (
                  <span className="permission-chip" key={permission}>
                    {permissionLabels[permission]}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function AuditLogPageContent({ user, auditLogs }: { user: AppUser; auditLogs: AuditLog[] }) {
  const canReadAuditLogs = hasPermission(user.role, "roles:manage");

  return (
    <>
      <PageHeader eyebrow="운영 감사" title="감사 로그" user={user} />
      <section className="panel">
        <div className="panel-heading">
          <h2>최근 변경 내역</h2>
          <span>{canReadAuditLogs ? `${auditLogs.length}건` : "관리자 권한 필요"}</span>
        </div>
        {canReadAuditLogs ? (
          <div className="audit-list">
            {auditLogs.map((log) => (
              <article className="audit-row" key={log.id}>
                <div className="person-block">
                  <strong>{auditActionLabels[log.action] ?? log.action}</strong>
                  <span>
                    {log.actorName} · {log.targetTable}
                    {log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ""}
                  </span>
                </div>
                <time className="meta" dateTime={log.createdAt}>
                  {new Date(log.createdAt).toLocaleString("ko-KR")}
                </time>
                <details className="audit-details">
                  <summary>변경값</summary>
                  <pre>{JSON.stringify({ before: log.beforeData, after: log.afterData, metadata: log.metadata }, null, 2)}</pre>
                </details>
              </article>
            ))}
            {auditLogs.length === 0 ? (
              <article className="care-item">
                <div className="person-block">
                  <strong>아직 기록이 없습니다</strong>
                  <span>멤버/소그룹/출석 변경이 발생하면 이곳에 기록됩니다.</span>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <article className="care-item">
            <div className="person-block">
              <strong>감사 로그 접근 제한</strong>
              <span>관리자만 감사 로그를 확인할 수 있습니다.</span>
            </div>
          </article>
        )}
      </section>
    </>
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

function PageHeader({
  eyebrow,
  title,
  user,
  children,
}: {
  eyebrow: string;
  title: string;
  user: AppUser;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="meta">
          {user.name} · {roleLabels[user.role]} 권한
        </p>
      </div>
      {children ? <div className="topbar-actions">{children}</div> : null}
    </header>
  );
}

function GroupSummaryPanel({ members, groups }: { members: Member[]; groups: Group[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>소그룹 현황</h2>
        <span>인원과 최근 출석률</span>
      </div>
      <div className="group-summary">
        {groups.map((group) => {
          const groupMembers = members.filter((member) => member.groupName === group.name);
          const present = groupMembers.filter((member) => member.present).length;
          const rate = groupMembers.length ? Math.round((present / groupMembers.length) * 100) : 0;
          return (
            <article className="summary-row" key={group.id}>
              <div className="person-block">
                <strong>{group.name}</strong>
                <span>
                  리더 {group.leaderName} · {groupMembers.length}/{group.targetSize}명
                </span>
              </div>
              <span className={`attendance-pill ${rate >= 70 ? "present" : ""}`}>{rate}%</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const roleLabels: Record<Role, string> = {
  admin: "관리자",
  leader: "리더",
  staff: "스태프",
  member: "멤버",
};

const statusLabels: Record<Member["status"], string> = {
  active: "활동",
  new: "새가족",
  care: "돌봄 필요",
  inactive: "비활성화",
};

const attendanceFilterLabels = {
  all: "전체",
  present: "출석",
  absent: "미출석",
};

const permissionLabels = {
  "members:read": "멤버 보기",
  "members:write": "멤버 수정",
  "attendance:read": "출석 보기",
  "attendance:write": "출석 체크",
  "groups:read": "소그룹 보기",
  "groups:write": "소그룹 수정",
  "roles:manage": "권한 관리",
  "sensitive:read": "민감 정보 열람",
};

const auditActionLabels: Record<string, string> = {
  "member.create": "멤버 생성",
  "member.update": "멤버 수정",
  "member.deactivate": "멤버 비활성화",
  "member.reactivate": "멤버 다시 활성화",
  "member.custom_fields.update": "멤버 커스텀 필드 수정",
  "group.create": "소그룹 생성",
  "group.update": "소그룹 수정",
  "attendance.toggle": "출석 변경",
  "custom_field.create": "커스텀 필드 생성",
};
