import { notFound } from "next/navigation";
import { AttendanceManager, CalendarPageContent, DashboardOverview, GroupsPageContent, MembersManager, NewFamilyPageContent } from "@/components/dashboard";
import { sampleGroups, sampleMembers } from "@/lib/sample-data";

export default async function DesignPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;
  const views = { attendance: AttendanceManager, calendar: CalendarPageContent, groups: GroupsPageContent, members: MembersManager, "new-family": NewFamilyPageContent };
  const Preview = view && Object.hasOwn(views, view) ? views[view as keyof typeof views] : DashboardOverview;

  return (
    <main className="main-content">
      <Preview
        user={{ id: "design-preview", name: "미리보기", email: "preview@example.com", role: "admin" }}
        members={sampleMembers}
        groups={sampleGroups}
        attendanceDate="2026-09-13"
        attendanceTitle="주일 예배"
        attendanceEvents={[]}
      />
    </main>
  );
}
