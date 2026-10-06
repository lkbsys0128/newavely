"use client";

import { useActionState } from "react";
import { createMemberLinkRequest, type ActionState } from "@/app/actions";
import { isActionableLinkRequest } from "@/lib/member-link-requests";
import type { AppUser } from "@/lib/app-page-data";
import type { Member, MemberLinkRequest } from "@/lib/types";

const initialActionState: ActionState = { ok: false, message: "" };

export function OnboardingPanel({
  user,
  memberLinkRequests,
}: {
  user: AppUser;
  currentMemberId: string;
  members: Member[];
  memberLinkRequests: MemberLinkRequest[];
}) {
  const [state, action, isSubmitting] = useActionState(createMemberLinkRequest, initialActionState);
  const pendingRequest = memberLinkRequests.find(isActionableLinkRequest);
  const rejectedRequest = memberLinkRequests.find((request) => request.status === "rejected");

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
            <form action={action} className="onboarding-request-admin">
              <div className="onboarding-request-copy">
                <strong>교적 연결 요청</strong>
                <span>이름과 소속을 남겨주시면 관리자가 확인 후 교적을 연결합니다.</span>
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
