export default function HomePage() {
  return (
    <main style={{ padding: 48, maxWidth: 720 }}>
      <h1 style={{ marginBottom: 8 }}>CorpSol</h1>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Панель руководителей. Экран терминала для отметки прихода открывается по
        собственной ссылке вида <code>/terminal/&lt;id&gt;?token=&lt;токен&gt;</code> —
        токен выпускает администратор.
      </p>
    </main>
  );
}
