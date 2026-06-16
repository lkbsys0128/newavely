import { AppPageGate } from "@/components/app-page-gate";
import { DashboardOverview } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getAppPageData({ page: "dashboard" });

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <DashboardOverview
          user={readyData.user}
          members={readyData.members}
          groups={readyData.groups}
          attendanceEvents={readyData.attendanceEvents}
          memberStatusMessages={readyData.memberStatusMessages}
          dashboardMetrics={readyData.dashboardMetrics}
          globalStats={readyData.globalStats}
        />
      )}
    </AppPageGate>
  );
}
