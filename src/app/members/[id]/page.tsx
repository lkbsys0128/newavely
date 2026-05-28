import { AppPageGate } from "@/components/app-page-gate";
import { MemberDetailPageContent } from "@/components/member-detail";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, data] = await Promise.all([params, getAppPageData()]);

  return (
    <AppPageGate data={data}>
      {(readyData) => {
        const member = readyData.members.find((item) => item.id === id);

        if (!member) {
          return (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">멤버 상세</p>
                  <h1>멤버를 찾을 수 없습니다</h1>
                </div>
                <a className="secondary-button" href="/members">
                  목록
                </a>
              </div>
            </section>
          );
        }

        return (
          <MemberDetailPageContent
            user={readyData.user}
            member={member}
            groups={readyData.groups}
            members={readyData.members}
            customFieldDefinitions={readyData.customFieldDefinitions}
          />
        );
      }}
    </AppPageGate>
  );
}
