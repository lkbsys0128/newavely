import { AppPageGate } from "@/components/app-page-gate";
import { FeedbackPageContent } from "@/components/dashboard";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const data = await getAppPageData();

  return (
    <AppPageGate data={data}>
      {(readyData) => (
        <FeedbackPageContent
          user={readyData.user}
          members={readyData.members}
          groups={readyData.groups}
          adminFeedbackMessages={readyData.adminFeedbackMessages}
        />
      )}
    </AppPageGate>
  );
}
