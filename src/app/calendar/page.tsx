import { AppPageGate } from "@/components/app-page-gate";
import { CalendarPageContent } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const data = await getAppPageData({ page: "calendar" });

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <CalendarPageContent
          user={readyData.user}
          members={readyData.members}
          groups={readyData.groups}
          attendanceEvents={readyData.attendanceEvents}
          calendarEvents={readyData.calendarEvents}
          globalStats={readyData.globalStats}
        />
      )}
    </AppPageGate>
  );
}
