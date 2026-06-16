import { AppPageGate } from "@/components/app-page-gate";
import { AttendanceManager } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId } = await searchParams;
  const data = await getAppPageData({ attendanceEventId: eventId, page: "attendance" });

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <AttendanceManager
          user={readyData.user}
          attendanceDate={readyData.attendanceDate}
          attendanceTitle={readyData.attendanceTitle}
          attendanceEventId={readyData.attendanceEventId}
          attendanceEvents={readyData.attendanceEvents}
          members={readyData.members}
          groups={readyData.groups}
          globalStats={readyData.globalStats}
        />
      )}
    </AppPageGate>
  );
}
