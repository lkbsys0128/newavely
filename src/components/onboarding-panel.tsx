"use client";

import { useActionState, useMemo, useState } from "react";
import { createMemberLinkRequest, type ActionState } from "@/app/actions";
import { isMergedPlaceholderMember } from "@/lib/member-filters";
import type { AppUser } from "@/lib/app-page-data";
import type { Member, MemberLinkRequest } from "@/lib/types";

const initialActionState: ActionState = { ok: false, message: "" };

export function OnboardingPanel({
  user,
  currentMemberId,
  members,
  memberLinkRequests,
}: {
  user: AppUser;
  currentMemberId: string;
  members: Member[];
  memberLinkRequests: MemberLinkRequest[];
}) {
  const [query, setQuery] = useState("");
  const [state, action, isSubmitting] = useActionState(createMemberLinkRequest, initialActionState);
  const pendingRequest = memberLinkRequests.find((request) => request.status === "pending");
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = useMemo(
    () =>
      members
        .filter((member) => member.id !== currentMemberId)
        .filter((member) => !member.authUserId && member.status !== "inactive" && !isMergedPlaceholderMember(member))
        .filter((member) => {
          if (!normalizedQuery) return true;
          return [member.name, member.email, member.phone, member.groupName].some((value) => value.toLowerCase().includes(normalizedQuery));
        })
        .slice(0, 30),
    [currentMemberId, members, normalizedQuery],
  );

  return (
    <main className="main-content">
      <section className="panel onboarding-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">첫 로그인 확인</p>
            <h1>본인 교적을 연결해주세요</h1>
            <p className="meta">
              {user.name} · {user.email || "이메일 없음"} 계정은 아직 Newavely 교적과 연결되지 않았습니다.
            </p>
          </div>
          <span className="status-pill">승인 대기 전용</span>
        </div>

        {pendingRequest ? (
          <div className="empty-state">
            <strong>관리자 승인 대기 중입니다</strong>
            <span>
              요청 대상: {pendingRequest.targetName}
              {pendingRequest.targetEmail ? ` · ${pendingRequest.targetEmail}` : ""}
            </span>
            <span>승인되면 앱 권한은 기본 멤버 권한으로 시작하며, 관리 권한은 관리자가 별도로 부여합니다.</span>
          </div>
        ) : (
          <>
            <div className="member-form compact-form">
              <label>
                이름, 이메일, 전화번호, 소그룹으로 찾기
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="예: 임주환, 순장, 전화번호 일부"
                />
              </label>
            </div>

            <div className="onboarding-candidate-list">
              {candidates.map((member) => (
                <form action={action} className="definition-row onboarding-candidate" key={member.id}>
                  <input name="targetMemberId" type="hidden" value={member.id} />
                  <input
                    name="note"
                    type="hidden"
                    value={`첫 로그인 계정 ${user.name} (${user.email || "이메일 없음"})의 교적 연결 요청`}
                  />
                  <div className="person-block">
                    <strong>{member.name}</strong>
                    <span>
                      {member.groupName} · {member.email || "이메일 없음"} · {member.phone || "연락처 없음"}
                    </span>
                  </div>
                  <button className="primary-button" type="submit" disabled={isSubmitting}>
                    이 멤버로 요청
                  </button>
                </form>
              ))}
            </div>

            {candidates.length === 0 ? (
              <form action={action} className="empty-state onboarding-request-admin">
                <strong>내 교적을 찾지 못했나요?</strong>
                <span>관리자에게 확인 요청을 보내면, 관리자가 교적을 확인한 뒤 연결하거나 새 교적을 만들어줍니다.</span>
                <input name="targetMemberId" type="hidden" value="" />
                <label>
                  관리자에게 남길 메모
                  <textarea name="note" placeholder="예: 이름은 임주환이고, 청년부 소속입니다." />
                </label>
                <button className="secondary-button" type="submit" disabled={isSubmitting}>
                  관리자에게 요청
                </button>
              </form>
            ) : null}

            <ActionMessage state={state} />
          </>
        )}
      </section>
    </main>
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
