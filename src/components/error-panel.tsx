export function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <main className="main-content">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">서버 설정 확인 필요</p>
            <h1>{title}</h1>
          </div>
          <span>Supabase</span>
        </div>
        <article className="care-item">
          <div className="person-block">
            <strong>오류 메시지</strong>
            <span>{message}</span>
          </div>
        </article>
      </section>
    </main>
  );
}
