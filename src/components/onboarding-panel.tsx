"use client";

import { useActionState, useMemo, useState } from "react";
import { createMemberLinkRequest, type ActionState } from "@/app/actions";
import { isMergedPlaceholderMember } from "@/lib/member-filters";
import { isActionableLinkRequest } from "@/lib/member-link-requests";
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
  const pendingRequest = memberLinkRequests.find(isActionableLinkRequest);
  const rejectedRequest = memberLinkRequests.find((request) => request.status === "rejected");
  const normalizedQuery = query.trim().toLowerCase();
  const canShowResults = normalizedQuery.length >= 2;
  const candidates = useMemo(
    () => {
      if (!canShowResults) return [];

      return members
        .filter((member) => member.id !== currentMemberId)
        .filter((member) => !member.authUserId && member.status !== "inactive" && !isMergedPlaceholderMember(member))
        .filter((member) =>
          [member.name, member.email, member.groupName].some((value) => value.toLowerCase().includes(normalizedQuery)),
        )
        .slice(0, 12);
    },
    [canShowResults, currentMemberId, members, normalizedQuery],
  );

  return (
    <main className="main-content">
      <section className="panel onboarding-panel">
        <div className="onboarding-hero">
          <div className="onboarding-hero-copy">
            <p className="eyebrow">첫 로그인 확인</p>
            <h1>본인 교적을 연결해주세요</h1>
            <p className="meta">
              {user.name} · {user.email || "이메일 없음"} 계정은 아직 Newavely 교적과 연결되지 않았습니다.
            </p>
          </div>
          <span className="status-pill onboarding-status-pill">승인 대기 전용</span>
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
        ) : rejectedRequest ? (
          <div className="empty-state rejected-state">
            <strong>교적 연결 요청이 거절되었습니다</strong>
            <span>
              {rejectedRequest.resolvedAt
                ? `${new Date(rejectedRequest.resolvedAt).toLocaleString("ko-KR")}에 관리자가 요청을 거절했습니다.`
                : "관리자가 요청을 거절했습니다."}
            </span>
            <span>계정 연결이 필요하면 Newave 운영 관리자에게 연락해주세요. 관리자가 다시 검토로 돌리면 승인 대기 상태로 바뀝니다.</span>
          </div>
        ) : (
          <>
            <div className="onboarding-search">
              <div>
                <h2>교적 검색</h2>
                <p className="meta">본인 이름, 이메일, 순 이름 중 기억나는 정보로 검색해주세요.</p>
              </div>
              <label className="onboarding-search-field">
                <span>검색어</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="예: 임주환, 주환 순, joohwan@gmail.com"
                />
              </label>
              <p className="onboarding-help">검색 결과에서 본인 교적을 선택하면 관리자에게 연결 승인을 요청합니다.</p>
            </div>

            {!canShowResults ? (
              <div className="empty-state onboarding-empty-state">
                <strong>검색어를 입력하면 교적 후보가 표시됩니다</strong>
                <span>전체 멤버 목록을 먼저 보여주지 않고, 입력한 조건에 맞는 후보만 보여줍니다.</span>
              </div>
            ) : null}

            {canShowResults && candidates.length > 0 ? (
              <div className="onboarding-candidate-list">
                {candidates.map((member) => (
                  <form action={action} className="onboarding-candidate" key={member.id}>
                    <input name="targetMemberId" type="hidden" value={member.id} />
                    <input
                      name="note"
                      type="hidden"
                      value={`첫 로그인 계정 ${user.name} (${user.email || "이메일 없음"})의 교적 연결 요청`}
                    />
                    <div className="person-block">
                      <strong>{member.name}</strong>
                      <span>{member.groupName || "소그룹 미배정"}</span>
                    </div>
                    <button className="primary-button" type="submit" disabled={isSubmitting}>
                      이 멤버로 요청
                    </button>
                  </form>
                ))}
              </div>
            ) : null}

            {canShowResults && candidates.length === 0 ? (
              <form action={action} className="onboarding-request-admin">
                <div className="onboarding-request-copy">
                  <strong>내 교적을 찾지 못했나요?</strong>
                  <span>관리자에게 확인 요청을 보내면, 관리자가 교적을 확인한 뒤 연결하거나 새 교적을 만들어줍니다.</span>
                </div>
                <input name="targetMemberId" type="hidden" value="" />
                <label className="onboarding-note-field">
                  <span>관리자에게 남길 메모</span>
                  <textarea name="note" placeholder="예: 이름은 홍길동이고, 청년부 소속입니다." />
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
