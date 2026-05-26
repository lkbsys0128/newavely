import { Dashboard } from "@/components/dashboard";
import { AuthPanel } from "@/components/auth-panel";
import { SetupPanel } from "@/components/setup-panel";
import { ErrorPanel } from "@/components/error-panel";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ensureStarterData, getDashboardData, getOrCreateCurrentMember } from "@/lib/supabase/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!hasSupabaseEnv()) {
    return <SetupPanel />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="main-content">
        <AuthPanel />
      </main>
    );
  }

  let currentMember;
  let dashboardData;

  try {
    currentMember = await getOrCreateCurrentMember(supabase, {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name,
    });
    await ensureStarterData(supabase);
    dashboardData = await getDashboardData(supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Supabase error";
    return <ErrorPanel title="Supabase 데이터 연결 실패" message={message} />;
  }

  return (
    <main className="main-content">
      <Dashboard
        user={{
          id: user.id,
          name: user.user_metadata?.full_name ?? user.email ?? "관리자",
          email: user.email ?? "",
          role: currentMember.role,
        }}
        attendanceDate={dashboardData.attendanceDate}
        attendanceEventId={dashboardData.attendanceEventId}
        initialMembers={dashboardData.members}
        groups={dashboardData.groups}
      />
    </main>
  );
}
