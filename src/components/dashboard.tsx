"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createAttendanceEvent,
  createGroup,
  createMember,
  deleteMemberPermanently,
  deactivateMember,
  approveMemberLinkRequest,
  rejectMemberLinkRequest,
  reactivateMember,
  toggleAttendance,
  updateAttendanceReason,
  updateGroup,
  updateMember,
  updateMemberRole,
  type ActionState,
} from "@/app/actions";
import { hasPermission, permissionsByRole, type Role } from "@/lib/rbac";
import type { AppUser } from "@/lib/app-page-data";
import type { AttendanceEvent, AuditLog, Group, Member, MemberLinkRequest } from "@/lib/types";
import {
  defaultMemberFilters,
  filterMembers,
  findPotentialDuplicateMembers,
  isMergedPlaceholderMember,
  type MemberFilters,
} from "@/lib/member-filters";
import { isActionableLinkRequest } from "@/lib/member-link-requests";

type AppDataProps = {
  user: AppUser;
  members: Member[];
  groups: Group[];
  memberLinkRequests?: MemberLinkRequest[];
};

type AttendanceFilter = "all" | "present" | "absent" | "excused";
type AttendanceStatus = "present" | "absent" | "excused";

const initialActionState: ActionState = { ok: false, message: "" };

export function DashboardOverview({ user, members, groups }: AppDataProps) {
  const activeMembers = members.filter((member) => member.status !== "inactive" && !isMergedPlaceholderMember(member));
  const presentCount = activeMembers.filter((member) => member.present).length;
  const attendanceRate = activeMembers.length ? Math.round((presentCount / activeMembers.length) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="2026 공동체 관리 MVP" title="대시보드" user={user} />

      <div className="metric-grid">
        <article className="metric-card">
          <span>전체 멤버</span>
          <strong>{activeMembers.length}</strong>
          <small>비활성 멤버 제외</small>
        </article>
        <article className="metric-card">
          <span>이번 주 출석</span>
          <strong>{attendanceRate}%</strong>
          <small>
            {presentCount}/{activeMembers.length}명 출석
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
            {activeMembers
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

        <GroupSummaryPanel members={activeMembers} groups={groups} />
      </div>
    </>
  );
}

export function MembersManager({ user, members, groups }: AppDataProps) {
  const [filters, setFilters] = useState<MemberFilters>(defaultMemberFilters);
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
  const [deleteMemberState, deleteMemberAction, isDeletingMember] = useActionState(deleteMemberPermanently, initialActionState);
  const canManageMembers = hasPermission(user.role, "members:write");
  const canDeleteMembers = hasPermission(user.role, "roles:manage");
  const visibleMembers = (showInactive ? members : members.filter((member) => member.status !== "inactive")).filter(
    (member) => !isMergedPlaceholderMember(member),
  );
  const duplicateMemberCandidates = useMemo(
    () => findPotentialDuplicateMembers(members.filter((member) => !isMergedPlaceholderMember(member))),
    [members],
  );
  const selectedMember =
    visibleMembers.find((member) => member.id === selectedMemberId) ?? visibleMembers[0] ?? members[0];
  const filteredMembers = useMemo(() => {
    return filterMembers(visibleMembers, filters);
  }, [visibleMembers, filters]);
  const hasActiveFilters =
    filters.query !== "" ||
    filters.groupId !== "all" ||
    filters.role !== "all" ||
    filters.status !== "all" ||
    filters.account !== "all";

  function updateFilters(nextFilters: Partial<MemberFilters>) {
    setFilters((current) => ({ ...current, ...nextFilters }));
  }

  return (
    <>
      <PageHeader eyebrow="멤버 관리" title="멤버" user={user}>
        <label className="search-field">
          <span>검색</span>
          <input
            type="search"
            placeholder="이름, 이메일, 연락처, 메모"
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
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

      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            소그룹
            <select value={filters.groupId} onChange={(event) => updateFilters({ groupId: event.target.value })}>
              <option value="all">전체 소그룹</option>
              <option value="unassigned">미배정</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            역할
            <select value={filters.role} onChange={(event) => updateFilters({ role: event.target.value as MemberFilters["role"] })}>
              <option value="all">전체 역할</option>
              {Object.entries(roleLabels).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            상태
            <select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value as MemberFilters["status"] })}>
              <option value="all">전체 상태</option>
              {Object.entries(statusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            계정
            <select value={filters.account} onChange={(event) => updateFilters({ account: event.target.value as MemberFilters["account"] })}>
              <option value="all">전체 계정</option>
              <option value="connected">Google 연결</option>
              <option value="unconnected">미연결</option>
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={!hasActiveFilters}
            onClick={() => setFilters(defaultMemberFilters)}
            type="button"
          >
            필터 초기화
          </button>
        </div>
      </section>

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
                  <th>계정</th>
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
                    <td>
                      <span className={`account-pill ${member.authUserId ? "connected" : ""}`}>
                        {member.authUserId ? "Google 연결" : "미연결"}
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
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-table-state">
                        <strong>조건에 맞는 멤버가 없습니다</strong>
                        <span>검색어 또는 필터를 조금 넓혀보세요.</span>
                      </div>
                    </td>
                  </tr>
                ) : null}
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
          {selectedMember && canDeleteMembers ? (
            <form action={deleteMemberAction} className="danger-zone-form">
              <input name="id" type="hidden" value={selectedMember.id} />
              <div className="person-block">
                <strong>완전 삭제</strong>
                <span>삭제하면 이메일과 Google 연결 충돌은 사라지지만, 출석/돌봄/연결 요청 기록도 함께 정리됩니다.</span>
              </div>
              <label>
                확인을 위해 멤버 이름 입력
                <input name="confirmName" placeholder={selectedMember.name} />
              </label>
              <ActionMessage state={deleteMemberState} />
              <button className="danger-button" type="submit" disabled={isDeletingMember}>
                완전히 삭제
              </button>
            </form>
          ) : null}
        </aside>
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>중복/계정 연결 확인</h2>
          <span>{duplicateMemberCandidates.length}건 후보</span>
        </div>
        <div className="duplicate-list">
          {duplicateMemberCandidates.map((candidate) => {
            const linkedMember = candidate.members.find((member) => member.authUserId);
            const unlinkedMembers = candidate.members.filter((member) => !member.authUserId && member.status !== "inactive");
            return (
              <article className="duplicate-card" key={candidate.key}>
                <div className="panel-heading compact-heading">
                  <div>
                    <h3>{candidate.reasonLabel}</h3>
                    <p className="meta">같은 사람일 가능성이 있는 멤버를 확인한 뒤 연결해주세요.</p>
                  </div>
                  <span>{candidate.members.length}명</span>
                </div>
                <div className="duplicate-member-list">
                  {candidate.members.map((member) => (
                    <div className="detail-row" key={member.id}>
                      <div className="person-block">
                        <strong>{member.name}</strong>
                        <span>
                          {member.groupName} · {member.email || "이메일 없음"} · {member.phone}
                        </span>
                      </div>
                      <div className="row-actions">
                        <span className={`status-pill ${member.status === "active" ? "active" : ""}`}>
                          {statusLabels[member.status]}
                        </span>
                        <span className={`account-pill ${member.authUserId ? "connected" : ""}`}>
                          {member.authUserId ? "Google 연결" : "미연결"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {linkedMember && unlinkedMembers.length > 0 ? (
                  <div className="merge-action-list">
                    <Link className="primary-button table-action" href="/permissions">
                      권한에서 프로필 병합
                    </Link>
                  </div>
                ) : (
                  <p className="meta">자동 연결 가능한 조합은 없습니다. 이름/연락처를 확인해 수동으로 정리해주세요.</p>
                )}
              </article>
            );
          })}
          {duplicateMemberCandidates.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>확인할 중복 후보가 없습니다</strong>
                <span>같은 이름이나 연락처로 겹치는 멤버가 생기면 여기에 표시됩니다.</span>
              </div>
            </article>
          ) : null}
        </div>
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
  const activeMembers = members.filter((member) => member.status !== "inactive");
  const unassignedMembers = activeMembers.filter((member) => !member.groupId);
  const totalPresent = activeMembers.filter((member) => member.present).length;
  const totalAttendanceRate = activeMembers.length ? Math.round((totalPresent / activeMembers.length) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="소그룹 관리" title="소그룹" user={user} />
      <div className="metric-grid">
        <article className="metric-card">
          <span>전체 활동 멤버</span>
          <strong>{activeMembers.length}</strong>
          <small>비활성 멤버 제외</small>
        </article>
        <article className="metric-card">
          <span>소그룹</span>
          <strong>{groups.length}</strong>
          <small>현재 등록된 순</small>
        </article>
        <article className="metric-card">
          <span>미배정</span>
          <strong>{unassignedMembers.length}</strong>
          <small>소그룹 배정 필요</small>
        </article>
        <article className="metric-card">
          <span>최근 출석률</span>
          <strong>{totalAttendanceRate}%</strong>
          <small>{totalPresent}명 출석</small>
        </article>
      </div>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>소그룹 추가</h2>
          <span>{canManageGroups ? "이름과 리더를 지정" : "관리자 권한 필요"}</span>
        </div>
        <form action={createGroupAction} className="member-form group-create-form">
          <label>
            소그룹 이름
            <input name="name" required placeholder="예: 은미 순" disabled={!canManageGroups} />
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
          <div className="form-actions">
            <ActionMessage state={createGroupState} />
            <button className="primary-button" type="submit" disabled={!canManageGroups || isCreatingGroup}>
              추가
            </button>
          </div>
        </form>
      </section>

      <section className="group-grid">
        {groups.map((group) => {
          const groupMembers = activeMembers.filter((member) => member.groupId === group.id);
          const present = groupMembers.filter((member) => member.present).length;
          const rate = groupMembers.length ? Math.round((present / groupMembers.length) * 100) : 0;
          const careCount = groupMembers.filter(
            (member) =>
              member.status === "care" ||
              member.careFollowups.some((followup) => followup.status !== "resolved"),
          ).length;
          return (
            <article className="group-card" key={group.id}>
              <header>
                <div>
                  <h2>{group.name}</h2>
                  <p className="meta">리더 {group.leaderName}</p>
                </div>
                <span className="role-pill">{groupMembers.length}명</span>
              </header>
              <div className="group-card-stats">
                <div>
                  <strong>{rate}%</strong>
                  <span>출석률</span>
                </div>
                <div>
                  <strong>{present}</strong>
                  <span>출석</span>
                </div>
                <div>
                  <strong>{careCount}</strong>
                  <span>돌봄</span>
                </div>
              </div>
              <div className="progress" aria-label={`${group.name} 출석률 ${rate}%`}>
                <span style={{ width: `${rate}%` }} />
              </div>
              <div className="group-member-list">
                {groupMembers.slice(0, 6).map((member) => (
                  <Link className="member-chip" href={`/members/${member.id}`} key={member.id}>
                    {member.name}
                  </Link>
                ))}
                {groupMembers.length > 6 ? <span className="member-chip muted">+{groupMembers.length - 6}</span> : null}
                {groupMembers.length === 0 ? <span className="meta">배정된 멤버가 없습니다</span> : null}
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
                <ActionMessage state={updateGroupState} />
                <button className="secondary-button" type="submit" disabled={!canManageGroups || isUpdatingGroup}>
                  저장
                </button>
              </form>
            </article>
          );
        })}
      </section>
      {unassignedMembers.length > 0 ? (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <h2>미배정 멤버</h2>
            <span>{unassignedMembers.length}명</span>
          </div>
          <div className="group-member-list">
            {unassignedMembers.map((member) => (
              <Link className="member-chip" href={`/members/${member.id}`} key={member.id}>
                {member.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function AttendanceManager({
  user,
  attendanceDate,
  attendanceTitle,
  attendanceEventId,
  attendanceEvents,
  members,
  groups,
}: AppDataProps & {
  attendanceDate: string;
  attendanceTitle: string;
  attendanceEventId?: string;
  attendanceEvents: AttendanceEvent[];
}) {
  const [localMembers, setLocalMembers] = useState(members);
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
  const [createEventState, createEventAction, isCreatingEvent] = useActionState(createAttendanceEvent, initialActionState);
  const [isPending, startTransition] = useTransition();
  const canManageAttendance = hasPermission(user.role, "attendance:write");

  useEffect(() => {
    setLocalMembers(members);
  }, [attendanceEventId, members]);

  const activeMembers = localMembers.filter((member) => member.status !== "inactive");
  const activeMemberCount = activeMembers.length;
  const currentPresentCount = activeMembers.filter((member) => member.present).length;
  const currentExcusedCount = activeMembers.filter((member) => getMemberAttendanceStatus(member, attendanceEventId) === "excused").length;
  const currentAbsentCount = Math.max(activeMemberCount - currentPresentCount - currentExcusedCount, 0);
  const currentAttendanceRate = activeMemberCount ? Math.round((currentPresentCount / activeMemberCount) * 100) : 0;
  const groupAttendanceStats = groups.map((group) => {
    const groupMembers = activeMembers.filter((member) => member.groupId === group.id);
    const presentCount = groupMembers.filter((member) => member.present).length;
    return {
      id: group.id,
      name: group.name,
      presentCount,
      totalCount: groupMembers.length,
      rate: groupMembers.length ? Math.round((presentCount / groupMembers.length) * 100) : 0,
    };
  });
  const unassignedMembers = activeMembers.filter((member) => !member.groupId);
  const unassignedPresentCount = unassignedMembers.filter((member) => member.present).length;
  const unassignedAttendanceRate = unassignedMembers.length
    ? Math.round((unassignedPresentCount / unassignedMembers.length) * 100)
    : 0;
  const eventTrend = attendanceEvents.map((event) => {
    const presentCount =
      event.id === attendanceEventId
        ? currentPresentCount
        : activeMembers.filter((member) =>
            member.attendanceHistory.some((record) => record.eventId === event.id && record.status === "present"),
          ).length;
    const rate = activeMemberCount ? Math.round((presentCount / activeMemberCount) * 100) : 0;
    return { ...event, presentCount, rate };
  });
  const absenceWatchList = activeMembers
    .map((member) => {
      let streak = 0;
      for (const event of attendanceEvents.slice(0, 6)) {
        const record = member.attendanceHistory.find((item) => item.eventId === event.id);
        if (record?.status === "present" || record?.status === "excused") break;
        streak += 1;
      }
      return { member, streak };
    })
    .filter((item) => item.streak >= 3)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 8);

  const attendanceMembers = localMembers.filter((member) => {
    const status = getMemberAttendanceStatus(member, attendanceEventId);
    if (attendanceFilter === "present") return member.present;
    if (attendanceFilter === "absent") return status === "absent";
    if (attendanceFilter === "excused") return status === "excused";
    return true;
  });

  return (
    <>
      <PageHeader eyebrow="출석 관리" title="출석" user={user} />
      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>출석 이벤트 선택</h2>
          <span>{attendanceEvents.length}개 이벤트</span>
        </div>
        <div className="event-list">
          {attendanceEvents.map((event) => (
            <Link
              className={`event-chip ${event.id === attendanceEventId ? "active" : ""}`}
              href={`/attendance?eventId=${event.id}`}
              key={event.id}
            >
              <strong>{event.title}</strong>
              <span>{event.eventDate}</span>
            </Link>
          ))}
          {attendanceEvents.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>아직 출석 이벤트가 없습니다</strong>
                <span>새 출석 이벤트를 만들면 멤버별 출석을 체크할 수 있습니다.</span>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>새 출석 이벤트</h2>
          <span>{canManageAttendance ? "날짜와 이름을 입력" : "리더/관리자 권한 필요"}</span>
        </div>
        <form action={createEventAction} className="member-form compact-form">
          <label>
            날짜
            <input name="eventDate" type="date" required disabled={!canManageAttendance} />
          </label>
          <label>
            이름
            <input name="title" required placeholder="주일 예배" disabled={!canManageAttendance} />
          </label>
          <div className="form-actions full-width">
            <ActionMessage state={createEventState} />
            <button className="primary-button" type="submit" disabled={!canManageAttendance || isCreatingEvent}>
              만들기
            </button>
          </div>
        </form>
      </section>

      <section className="stats-grid">
        <article className="metric-card">
          <span>선택 이벤트 출석률</span>
          <strong>{currentAttendanceRate}%</strong>
          <small>
            {currentPresentCount}명 출석 · {currentAbsentCount}명 미확인 · {currentExcusedCount}명 사유 있음
          </small>
          <div className="progress">
            <span style={{ width: `${currentAttendanceRate}%` }} />
          </div>
        </article>
        <article className="panel stats-card">
          <div className="panel-heading">
            <h2>소그룹별 출석률</h2>
            <span>{attendanceTitle}</span>
          </div>
          <div className="stats-list">
            {groupAttendanceStats.map((group) => (
              <div className="stat-row" key={group.id}>
                <div className="person-block">
                  <strong>{group.name}</strong>
                  <span>
                    {group.presentCount}/{group.totalCount}명
                  </span>
                </div>
                <div className="stat-meter">
                  <div className="progress">
                    <span style={{ width: `${group.rate}%` }} />
                  </div>
                  <strong>{group.rate}%</strong>
                </div>
              </div>
            ))}
            {unassignedMembers.length > 0 ? (
              <div className="stat-row">
                <div className="person-block">
                  <strong>미배정</strong>
                  <span>
                    {unassignedPresentCount}/{unassignedMembers.length}명
                  </span>
                </div>
                <div className="stat-meter">
                  <div className="progress">
                    <span style={{ width: `${unassignedAttendanceRate}%` }} />
                  </div>
                  <strong>{unassignedAttendanceRate}%</strong>
                </div>
              </div>
            ) : null}
          </div>
        </article>
        <article className="panel stats-card">
          <div className="panel-heading">
            <h2>최근 이벤트 추이</h2>
            <span>최근 {eventTrend.length}개</span>
          </div>
          <div className="stats-list">
            {eventTrend.slice(0, 6).map((event) => (
              <div className="stat-row" key={event.id}>
                <div className="person-block">
                  <strong>{event.title}</strong>
                  <span>{event.eventDate}</span>
                </div>
                <div className="stat-meter">
                  <div className="progress">
                    <span style={{ width: `${event.rate}%` }} />
                  </div>
                  <strong>{event.rate}%</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="panel stats-card">
          <div className="panel-heading">
            <h2>미확인 연속 결석</h2>
            <span>사유 있음 제외</span>
          </div>
          <div className="stats-list">
            {absenceWatchList.map(({ member, streak }) => (
              <div className="stat-row" key={member.id}>
                <div className="person-block">
                  <strong>{member.name}</strong>
                  <span>{member.groupName}</span>
                </div>
                <div className="row-actions">
                  <span className="status-pill">{streak}회 연속</span>
                  <Link className="secondary-button table-action" href={`/members/${member.id}`}>
                    팔로업
                  </Link>
                </div>
              </div>
            ))}
            {absenceWatchList.length === 0 ? (
              <article className="care-item">
                <div className="person-block">
                  <strong>3회 이상 미확인 결석자가 없습니다</strong>
                  <span>사유가 저장된 결석은 이 목록에서 제외됩니다.</span>
                </div>
              </article>
            ) : null}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{attendanceTitle}</h2>
            <span>{attendanceDate}</span>
          </div>
          <div className="segmented">
            {(["all", "present", "absent", "excused"] as const).map((filter) => (
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
            <AttendanceRow
              canManageAttendance={canManageAttendance}
              eventId={attendanceEventId}
              isPending={isPending}
              key={member.id}
              member={member}
              onToggle={() => {
                if (!attendanceEventId) return;
                setLocalMembers((current) =>
                  current.map((item) => (item.id === member.id ? { ...item, present: !item.present } : item)),
                );
                startTransition(() => {
                  void toggleAttendance(member.id, attendanceEventId, !member.present);
                });
              }}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function AttendanceRow({
  member,
  eventId,
  canManageAttendance,
  isPending,
  onToggle,
}: {
  member: Member;
  eventId?: string;
  canManageAttendance: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  const [reasonState, reasonAction, isSavingReason] = useActionState(updateAttendanceReason, initialActionState);
  const currentRecord = member.attendanceHistory.find((record) => record.eventId === eventId);
  const status = getMemberAttendanceStatus(member, eventId);

  return (
    <article className="attendance-row">
      <div className="person-block">
        <strong>{member.name}</strong>
        <span>
          {member.groupName} · {member.phone}
        </span>
        {currentRecord?.note ? <span>사유: {currentRecord.note}</span> : null}
        {currentRecord?.excuseStartDate || currentRecord?.excuseEndDate ? (
          <span>
            기간: {currentRecord.excuseStartDate || "시작일 미입력"} - {currentRecord.excuseEndDate || "종료일 미입력"}
          </span>
        ) : null}
      </div>
      <span className={`attendance-pill ${status}`}>{attendanceStatusLabels[status]}</span>
      <div className="attendance-actions">
        <button
          className={member.present ? "secondary-button" : "primary-button"}
          disabled={!canManageAttendance || !eventId || isPending}
          onClick={onToggle}
          type="button"
        >
          {member.present ? "미출석 처리" : "출석 체크"}
        </button>
        <details className="reason-details">
          <summary>사유/기간</summary>
          <form action={reasonAction} className="reason-form">
            <input name="memberId" type="hidden" value={member.id} />
            <input name="eventId" type="hidden" value={eventId ?? ""} />
            <label>
              시작일
              <input
                name="excuseStartDate"
                type="date"
                defaultValue={currentRecord?.excuseStartDate}
                disabled={!canManageAttendance || !eventId}
              />
            </label>
            <label>
              종료일
              <input
                name="excuseEndDate"
                type="date"
                defaultValue={currentRecord?.excuseEndDate}
                disabled={!canManageAttendance || !eventId}
              />
            </label>
            <label className="full-width">
              사유
              <textarea
                name="note"
                placeholder="여행, 건강, 가정 일정 등"
                defaultValue={currentRecord?.note}
                disabled={!canManageAttendance || !eventId}
              />
            </label>
            <div className="form-actions full-width">
              <ActionMessage state={reasonState} />
              <button className="secondary-button" type="submit" disabled={!canManageAttendance || !eventId || isSavingReason}>
                사유 있음 저장
              </button>
            </div>
          </form>
        </details>
      </div>
    </article>
  );
}

function getMemberAttendanceStatus(member: Member, eventId?: string): AttendanceStatus {
  if (member.present) return "present";

  const currentRecord = member.attendanceHistory.find((record) => record.eventId === eventId);
  if (currentRecord?.status === "excused") return "excused";

  return "absent";
}

export function PermissionsPageContent({ user, members, groups, memberLinkRequests = [] }: AppDataProps) {
  const [roleState, roleAction, isUpdatingRole] = useActionState(updateMemberRole, initialActionState);
  const [approveState, approveAction, isApprovingRequest] = useActionState(approveMemberLinkRequest, initialActionState);
  const [rejectState, rejectAction, isRejectingRequest] = useActionState(rejectMemberLinkRequest, initialActionState);
  const canManageRoles = hasPermission(user.role, "roles:manage");
  const pendingLinkRequests = memberLinkRequests.filter(isActionableLinkRequest);
  const activeAdmins = members.filter((member) => member.role === "admin" && member.status !== "inactive");
  const connectedAdmins = activeAdmins.filter((member) => member.authUserId);
  const unlinkedActiveMembers = members
    .filter((member) => !member.authUserId && member.status !== "inactive" && !isMergedPlaceholderMember(member))
    .sort((a, b) => a.name.localeCompare(b.name));
  const roleManagedMembers = [...members]
    .filter((member) => member.status !== "inactive")
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader eyebrow="권한 관리" title="권한" user={user} />
      <div className="metric-grid">
        <article className="metric-card">
          <span>활성 관리자</span>
          <strong>{activeAdmins.length}</strong>
          <small>최소 1명 유지 필요</small>
        </article>
        <article className="metric-card">
          <span>Google 연결 관리자</span>
          <strong>{connectedAdmins.length}</strong>
          <small>실제 로그인 가능한 관리자</small>
        </article>
        <article className="metric-card">
          <span>리더/스태프</span>
          <strong>{members.filter((member) => member.role === "leader" || member.role === "staff").length}</strong>
          <small>운영 권한 보유</small>
        </article>
        <article className="metric-card">
          <span>멤버 기본 권한</span>
          <strong>{permissionsByRole.member.length}</strong>
          <small>읽기 중심 접근</small>
        </article>
      </div>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>관리자 온보딩 체크</h2>
          <span>{canManageRoles ? "관리자만 역할을 변경할 수 있습니다" : "관리자 권한 필요"}</span>
        </div>
        <div className="onboarding-list">
          <article className="detail-row">
            <div className="person-block">
              <strong>최소 1명의 활성 관리자 유지</strong>
              <span>마지막 활성 관리자는 다른 역할로 변경할 수 없도록 막혀 있습니다.</span>
            </div>
            <span className={`status-pill ${activeAdmins.length > 0 ? "active" : ""}`}>
              {activeAdmins.length > 0 ? "정상" : "필요"}
            </span>
          </article>
          <article className="detail-row">
            <div className="person-block">
              <strong>관리자 Google 계정 연결</strong>
              <span>관리자 권한은 실제 로그인 계정과 연결된 멤버에 부여하는 것이 안전합니다.</span>
            </div>
            <span className={`status-pill ${connectedAdmins.length > 0 ? "active" : ""}`}>
              {connectedAdmins.length > 0 ? "정상" : "확인 필요"}
            </span>
          </article>
        </div>
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>교적 연결 요청</h2>
            <p className="meta">첫 로그인 사용자가 기존 CSV 교적 멤버와 연결을 요청하면 여기서 승인합니다.</p>
          </div>
          <span>{pendingLinkRequests.length}건 대기</span>
        </div>
        <div className="role-management-list" id="link-requests">
          {pendingLinkRequests.map((request) => (
            <article className="definition-row" key={request.id}>
              <div className="detail-row">
                <div className="person-block">
                  <strong>{request.requesterName}</strong>
                  <span>
                    요청자 · {request.requesterEmail || "이메일 없음"} · {new Date(request.createdAt).toLocaleString("ko-KR")}
                  </span>
                  {request.note ? <span>메모: {request.note}</span> : null}
                </div>
                <div className="person-block">
                  <strong>{request.targetName}</strong>
                  <span>연결 대상 · {request.targetEmail || (request.targetMemberId ? "이메일 없음" : "관리자가 선택 필요")}</span>
                  {!request.targetMemberId ? (
                    <div className="link-request-resolution">
                      <label>
                        처리 방식
                        <select name="createTargetMode" form={`approve-link-request-${request.id}`} disabled={!canManageRoles}>
                          <option value="existing">기존 교적에 연결</option>
                          <option value="new">새 교적 생성 후 연결</option>
                        </select>
                      </label>
                      <label>
                        기존 교적 멤버
                        <select name="targetMemberId" form={`approve-link-request-${request.id}`} disabled={!canManageRoles}>
                          <option value="">선택</option>
                          {unlinkedActiveMembers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name} · {member.groupName} · {member.email || "이메일 없음"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="new-member-inline-fields">
                        <label>
                          새 이름
                          <input
                            name="newMemberName"
                            form={`approve-link-request-${request.id}`}
                            placeholder={request.requesterName}
                            disabled={!canManageRoles}
                          />
                        </label>
                        <label>
                          이메일
                          <input
                            name="newMemberEmail"
                            form={`approve-link-request-${request.id}`}
                            placeholder={request.requesterEmail || "선택 입력"}
                            disabled={!canManageRoles}
                          />
                        </label>
                        <label>
                          전화번호
                          <input
                            name="newMemberPhone"
                            form={`approve-link-request-${request.id}`}
                            placeholder="선택 입력"
                            disabled={!canManageRoles}
                          />
                        </label>
                        <label>
                          소그룹
                          <select name="newMemberGroupId" form={`approve-link-request-${request.id}`} disabled={!canManageRoles}>
                            <option value="">미배정</option>
                            {groups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="row-actions request-actions">
                <form action={approveAction} id={`approve-link-request-${request.id}`}>
                  <input name="id" type="hidden" value={request.id} />
                  <button className="primary-button" type="submit" disabled={!canManageRoles || isApprovingRequest}>
                    승인
                  </button>
                </form>
                <form action={rejectAction}>
                  <input name="id" type="hidden" value={request.id} />
                  <button className="danger-button" type="submit" disabled={!canManageRoles || isRejectingRequest}>
                    거절
                  </button>
                </form>
              </div>
            </article>
          ))}
          {pendingLinkRequests.length === 0 ? (
            <article className="care-item">
              <div className="person-block">
                <strong>대기 중인 요청이 없습니다</strong>
                <span>새 사용자가 내 프로필에서 연결 요청을 만들면 이곳에 표시됩니다.</span>
              </div>
            </article>
          ) : null}
        </div>
        <ActionMessage state={approveState} />
        <ActionMessage state={rejectState} />
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>멤버 역할 변경</h2>
          <span>{roleManagedMembers.length}명</span>
        </div>
        <div className="role-management-list">
          {roleManagedMembers.map((member) => (
            <form action={roleAction} className="role-management-row" key={member.id}>
              <input name="id" type="hidden" value={member.id} />
              <div className="person-block">
                <strong>{member.name}</strong>
                <span>
                  {member.groupName} · {member.email || "이메일 없음"} · {member.authUserId ? "Google 연결" : "미연결"}
                </span>
              </div>
              <select name="role" defaultValue={member.role} disabled={!canManageRoles}>
                {Object.entries(roleLabels).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
              <button className="secondary-button" type="submit" disabled={!canManageRoles || isUpdatingRole}>
                변경
              </button>
            </form>
          ))}
        </div>
        <ActionMessage state={roleState} />
      </section>

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
                  리더 {group.leaderName} · {groupMembers.length}명
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

const roleOrder: Record<Role, number> = {
  admin: 0,
  leader: 1,
  staff: 2,
  member: 3,
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
  absent: "미확인",
  excused: "사유 있음",
};

const attendanceStatusLabels = {
  present: "출석",
  absent: "미출석",
  excused: "사유 있음",
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
  "member.account_merge": "멤버 계정 연결",
  "member.profile_merge": "멤버 프로필 병합",
  "member.custom_fields.update": "멤버 커스텀 필드 수정",
  "group.create": "소그룹 생성",
  "group.update": "소그룹 수정",
  "attendance_event.create": "출석 이벤트 생성",
  "attendance.toggle": "출석 변경",
  "attendance.reason.update": "출석 사유 수정",
  "care_followup.create": "돌봄 팔로업 생성",
  "care_followup.update": "돌봄 팔로업 수정",
  "custom_field.create": "커스텀 필드 생성",
};
