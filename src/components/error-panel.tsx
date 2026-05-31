export function ErrorPanel({
  title,
  message,
  eyebrow = "서버 설정 확인 필요",
  label = "오류 메시지",
  context,
}: {
  title: string;
  message: string;
  eyebrow?: string;
  label?: string;
  context?: string;
}) {
  return (
    <main className="main-content">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <span>Supabase</span>
        </div>
        <article className="care-item">
          <div className="person-block">
            <strong>{label}</strong>
            <span>{message}</span>
            {context ? <span>{context}</span> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
