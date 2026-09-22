import { TerminalScreen } from './TerminalScreen';

interface TerminalPageProps {
  params: { terminalId: string };
  searchParams: { token?: string };
}

/**
 * Экран терминала в офисе. Токен передаётся в адресе страницы: монитор
 * открывают один раз по готовой ссылке и оставляют — учётная запись
 * администратора на нём не нужна.
 */
export default function TerminalPage({ params, searchParams }: TerminalPageProps) {
  const token = searchParams.token;

  if (!token) {
    return (
      <main style={styles.main}>
        <h1 style={styles.title}>Терминал не настроен</h1>
        <p style={styles.text}>
          В адресе страницы отсутствует токен. Выпустите его в панели администратора
          и откройте ссылку вида <code>/terminal/{params.terminalId}?token=…</code>
        </p>
      </main>
    );
  }

  return <TerminalScreen terminalId={params.terminalId} token={token} />;
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
    textAlign: 'center',
  },
  title: { fontSize: 32, margin: 0 },
  text: { color: 'var(--text-muted)', fontSize: 18, lineHeight: 1.6, maxWidth: 560 },
};
