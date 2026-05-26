import type { ReactNode } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { ErrorPanel } from "@/components/error-panel";
import { SetupPanel } from "@/components/setup-panel";
import type { AppPageData, ReadyAppPageData } from "@/lib/app-page-data";

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

  return <main className="main-content">{children(data)}</main>;
}
