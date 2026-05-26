import { AppPageGate } from "@/components/app-page-gate";
import { AttendanceManager } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const data = await getAppPageData();

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <AttendanceManager
          user={readyData.user}
          attendanceDate={readyData.attendanceDate}
          attendanceEventId={readyData.attendanceEventId}
          members={readyData.members}
          groups={readyData.groups}
        />
      )}
    </AppPageGate>
  );
}
