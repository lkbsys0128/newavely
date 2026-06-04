import type { ReactNode } from "react";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { ErrorPanel } from "@/components/error-panel";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { SetupPanel } from "@/components/setup-panel";
import type { AppPageData, ReadyAppPageData } from "@/lib/app-page-data";
import { isActionableLinkRequest } from "@/lib/member-link-requests";
import { hasPermission } from "@/lib/rbac";

export function AppPageGate({
  data,
  children,
}: {
  data: AppPageData;
  children: (data: ReadyAppPageData) => ReactNode;
}) {
  if (data.status === "setup") {
    return <SetupPanel />;
  }

  if (data.status === "auth") {
    return (
      <main className="main-content">
        <AuthPanel />
      </main>
    );
  }

  if (data.status === "error") {
    const isDeletedAccountError = data.message.includes("이전에 삭제된 멤버 계정");
    const isAccountAccessError = isDeletedAccountError || data.message.includes("현재 비활성화되어 로그인할 수 없습니다");

    if (isAccountAccessError) {
      return (
        <ErrorPanel
          eyebrow="계정 확인 필요"
          title="로그인할 수 없는 계정입니다"
          message={data.message}
          label="안내"
          context="계정 복구나 재활성화가 필요하면 Newavely 운영 관리자에게 연락해주세요."
          allowRestoreRequest={isDeletedAccountError}
        />
      );
    }

    return <ErrorPanel title="Supabase 데이터 연결 실패" message={data.message} />;
  }

  if (data.status === "onboarding") {
    return (
      <OnboardingPanel
        user={data.user}
        currentMemberId={data.currentMemberId}
        members={data.members}
        memberLinkRequests={data.memberLinkRequests}
      />
    );
  }

  return (
    <main className="main-content">
      <AdminNotificationBar data={data} />
      {children(data)}
    </main>
  );
}

function AdminNotificationBar({ data }: { data: ReadyAppPageData }) {
  if (!hasPermission(data.user.role, "roles:manage")) return null;

  const pendingLinkRequests = data.memberLinkRequests.filter(isActionableLinkRequest);
  const activeFeedbackMessages = data.adminFeedbackMessages.filter(
    (message) => message.status === "open" || message.status === "reviewing",
  );
  if (pendingLinkRequests.length === 0 && activeFeedbackMessages.length === 0) return null;

  return (
    <details className="notification-bar">
      <summary>
        <span>
          {pendingLinkRequests.length > 0 ? `${pendingLinkRequests.length}개의 교적 연결 요청` : ""}
          {pendingLinkRequests.length > 0 && activeFeedbackMessages.length > 0 ? " · " : ""}
          {activeFeedbackMessages.length > 0 ? `${activeFeedbackMessages.length}개의 피드백` : ""}
          이 확인을 기다립니다
        </span>
        <strong>확인</strong>
      </summary>
      <div className="notification-list">
        {pendingLinkRequests.slice(0, 5).map((request) => (
          <article className="notification-item" key={request.id}>
            <strong>{request.requesterName}</strong>
            <span>
              {request.requesterEmail || "이메일 없음"} → {request.targetName}
            </span>
          </article>
        ))}
        {pendingLinkRequests.length > 0 ? (
          <Link className="secondary-button" href="/permissions#link-requests">
            요청 관리로 이동
          </Link>
        ) : null}
        {activeFeedbackMessages.slice(0, 5).map((message) => (
          <article className="notification-item" key={message.id}>
            <strong>{message.title}</strong>
            <span>
              {message.reporterName} · {message.status === "open" ? "접수" : "검토 중"}
            </span>
          </article>
        ))}
        {activeFeedbackMessages.length > 0 ? (
          <Link className="secondary-button" href="/feedback#feedback-list">
            피드백 접수함으로 이동
          </Link>
        ) : null}
      </div>
    </details>
  );
}
