import type { ReactNode } from "react";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { ErrorPanel } from "@/components/error-panel";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { SetupPanel } from "@/components/setup-panel";
import type { AppPageData, ReadyAppPageData } from "@/lib/app-page-data";
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

  if (data.user.role === "member") {
    const member = data.members.find((item) => item.authUserId === data.user.id) ?? data.members.find((item) => item.email === data.user.email);

    return (
      <main className="main-content">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">기본 멤버 권한</p>
              <h1>{member?.name ?? data.user.name}</h1>
              <p className="meta">관리 기능 접근이 필요한 경우 관리자에게 리더/스태프 권한을 요청해주세요.</p>
            </div>
            <span className="status-pill active">승인 완료</span>
          </div>
          <div className="detail-grid">
            <div className="detail-row">
              <span>Google 계정</span>
              <strong>{data.user.email || "이메일 없음"}</strong>
            </div>
            <div className="detail-row">
              <span>소그룹</span>
              <strong>{member?.groupName ?? "미배정"}</strong>
            </div>
            <div className="detail-row">
              <span>연락처</span>
              <strong>{member?.phone ?? "미입력"}</strong>
            </div>
          </div>
        </section>
      </main>
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

  const pendingLinkRequests = data.memberLinkRequests.filter(
    (request) => request.status === "pending" && request.requesterName !== "알 수 없음",
  );
  if (pendingLinkRequests.length === 0) return null;

  return (
    <details className="notification-bar">
      <summary>
        <span>{pendingLinkRequests.length}개의 교적 연결 요청이 대기 중입니다</span>
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
        <Link className="secondary-button" href="/permissions#link-requests">
          요청 관리로 이동
        </Link>
      </div>
    </details>
  );
}
