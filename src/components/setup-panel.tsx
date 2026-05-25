export function SetupPanel() {
  return (
    <main className="main-content">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Supabase 설정 필요</p>
            <h1>환경 변수를 추가해주세요</h1>
          </div>
          <span>Vercel Project Settings</span>
        </div>
        <div className="care-list">
          <article className="care-item">
            <div className="person-block">
              <strong>NEXT_PUBLIC_SUPABASE_URL</strong>
              <span>Supabase Project Settings에서 확인</span>
            </div>
          </article>
          <article className="care-item">
            <div className="person-block">
              <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong>
              <span>Supabase anon public key</span>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
