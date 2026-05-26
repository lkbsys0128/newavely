import { AppPageGate } from "@/components/app-page-gate";
import { MembersManager } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const data = await getAppPageData();

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <MembersManager user={readyData.user} members={readyData.members} groups={readyData.groups} />
      )}
    </AppPageGate>
  );
}
