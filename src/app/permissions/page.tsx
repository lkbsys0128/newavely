import { AppPageGate } from "@/components/app-page-gate";
import { PermissionsPageContent } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const data = await getAppPageData();

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <PermissionsPageContent
          user={readyData.user}
          members={readyData.members}
          groups={readyData.groups}
          memberLinkRequests={readyData.memberLinkRequests}
        />
      )}
    </AppPageGate>
  );
}
