import { AppPageGate } from "@/components/app-page-gate";
import { LinksPageContent } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const data = await getAppPageData({ page: "links" });

  return (
    <AppPageGate data={data}>
      {(readyData) => <LinksPageContent user={readyData.user} members={readyData.members} groups={readyData.groups} importantLinks={readyData.importantLinks} />}
    </AppPageGate>
  );
}
