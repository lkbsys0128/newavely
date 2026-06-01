import { AppPageGate } from "@/components/app-page-gate";
import { MemberDetailPageContent } from "@/components/member-detail";
import { getAppPageData } from "@/lib/app-page-data";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const data = await getAppPageData();

  return (
    <AppPageGate data={data}>
      {(readyData) => {
        const member =
          readyData.members.find((item) => item.authUserId === readyData.user.id) ??
          readyData.members.find((item) => item.email === readyData.user.email);

        if (!member) {
          return (
            <main className="main-content">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">내 프로필</p>
                    <h1>연결된 멤버를 찾을 수 없습니다</h1>
                    <p className="meta">관리자에게 Google 계정과 멤버 교적 연결을 요청해주세요.</p>
                  </div>
                </div>
              </section>
            </main>
          );
        }

        return (
          <MemberDetailPageContent
            user={readyData.user}
            member={member}
            groups={readyData.groups}
            members={readyData.members}
            customFieldDefinitions={readyData.customFieldDefinitions}
            memberLinkRequests={readyData.memberLinkRequests}
            memberStatusMessages={readyData.memberStatusMessages}
            eyebrow="내 프로필"
            backHref="/"
            backLabel="대시보드"
            showLinkRequest={member.status === "new"}
          />
        );
      }}
    </AppPageGate>
  );
}
