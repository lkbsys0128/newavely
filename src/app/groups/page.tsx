import { AppPageGate } from "@/components/app-page-gate";
import { GroupsPageContent } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const data = await getAppPageData({ page: "groups" });

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <GroupsPageContent
          user={readyData.user}
          members={readyData.members}
          groups={readyData.groups}
          globalStats={readyData.globalStats}
        />
      )}
    </AppPageGate>
  );
}
