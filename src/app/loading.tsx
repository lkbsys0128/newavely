export default function Loading() {
  return (
    <main className="main-content page-loading" aria-busy="true" aria-label="페이지를 불러오는 중">
      <section className="panel loading-panel">
        <div className="loading-topline" />
        <div className="loading-title" />
        <div className="loading-subtitle" />
        <div className="loading-progress" aria-hidden="true">
          <span />
        </div>
      </section>

      <section className="metric-grid loading-grid" aria-hidden="true">
        <article className="metric-card loading-card">
          <span />
          <strong />
          <small />
        </article>
        <article className="metric-card loading-card">
          <span />
          <strong />
          <small />
        </article>
        <article className="metric-card loading-card">
          <span />
          <strong />
          <small />
        </article>
      </section>

      <section className="panel loading-list" aria-hidden="true">
        <div />
        <div />
        <div />
      </section>
    </main>
  );
}
