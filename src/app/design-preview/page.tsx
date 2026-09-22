import { notFound } from "next/navigation";
import { PrayerMeetingPage } from "@/components/prayer-meeting-page";
import { AttendanceManager, CalendarPageContent, DashboardOverview, GroupsPageContent, LinksPageContent, MembersManager, NewFamilyPageContent } from "@/components/dashboard";
import { sampleGroups, sampleMembers } from "@/lib/sample-data";

export default async function DesignPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;
  if (view === "prayer") return <main className="main-content prayer-page"><PrayerMeetingPage
    meeting={{ id: "11111111-1111-4111-8111-111111111111", event_date: "2026-09-21", entries: [{ title: "기도", detail: "" }], version: 1, created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z" }}
    history={[]} canEdit={false} creating={false} today="2026-09-21" page={1} count={1} error="" /></main>;
  if (view === "public-links") return <main className="main-content"><LinksPageContent user={null}
    importantLinks={[{ id: "preview-link", title: "공동체 안내", description: "공개 링크 미리보기", url: "https://example.com", iconKey: "website" }]} /></main>;
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
