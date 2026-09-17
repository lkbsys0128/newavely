import { notFound } from "next/navigation";
import { DashboardOverview } from "@/components/dashboard";
import { sampleGroups, sampleMembers } from "@/lib/sample-data";

export default function DesignPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="main-content">
      <DashboardOverview
        user={{ id: "design-preview", name: "미리보기", email: "preview@example.com", role: "admin" }}
        members={sampleMembers}
        groups={sampleGroups}
      />
    </main>
  );
}
