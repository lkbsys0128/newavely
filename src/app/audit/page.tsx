import { AppPageGate } from "@/components/app-page-gate";
import { AuditLogPageContent } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const data = await getAppPageData({ page: "audit" });

  return (
    <AppPageGate data={data}>
      {(readyData) => <AuditLogPageContent user={readyData.user} auditLogs={readyData.auditLogs ?? []} />}
    </AppPageGate>
  );
}
