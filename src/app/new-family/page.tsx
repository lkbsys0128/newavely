import { AppPageGate } from "@/components/app-page-gate";
import { NewFamilyPageContent } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function NewFamilyPage() {
  const data = await getAppPageData({ page: "new-family" });

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <NewFamilyPageContent
          user={readyData.user}
          members={readyData.members}
          groups={readyData.groups}
          newFamilyApplicants={readyData.newFamilyApplicants}
        />
      )}
    </AppPageGate>
  );
}
