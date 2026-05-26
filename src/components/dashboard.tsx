"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { createMember, toggleAttendance } from "@/app/actions";
import { hasPermission, permissionsByRole, type Role } from "@/lib/rbac";
import type { AppUser } from "@/lib/app-page-data";
import type { Group, Member } from "@/lib/types";

type AppDataProps = {
  user: AppUser;
  members: Member[];
  groups: Group[];
};

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
  const canManageMembers = hasPermission(user.role, "members:write");
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? members[0];
  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) =>
      [member.name, member.phone, member.groupName, member.role, member.status]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [members, query]);

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
            <div className="member-detail">
              <Detail label="이름" value={selectedMember.name} />
              <Detail label="연락처" value={selectedMember.phone} />
              <Detail label="주소" value={selectedMember.address} />
              <Detail label="세례/등록" value={selectedMember.baptismStatus} />
              <Detail label="커스텀 메모" value={selectedMember.notes} />
            </div>
          ) : null}
        </aside>
      </section>

      <section className="panel form-panel">
        <div className="panel-heading">
          <h2>멤버 추가</h2>
          <span>{canManageMembers ? "필수 정보만 먼저 입력" : "관리자/리더 권한 필요"}</span>
        </div>
        <form action={createMember} className="member-form">
          <label>
            이름
            <input name="name" required placeholder="예: 김하은" disabled={!canManageMembers} />
          </label>
          <label>
            연락처
            <input name="phone" required placeholder="010-0000-0000" disabled={!canManageMembers} />
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
          <button className="primary-button" type="submit" disabled={!canManageMembers}>
            추가
          </button>
        </form>
      </section>
    </>
  );
}

export function GroupsPageContent({ user, members, groups }: AppDataProps) {
  return (
    <>
      <PageHeader eyebrow="소그룹 관리" title="소그룹" user={user} />
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <strong>{value}</strong>
    </div>
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
