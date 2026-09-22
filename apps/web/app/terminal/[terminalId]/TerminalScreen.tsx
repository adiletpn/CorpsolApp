'use client';

import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CodeResponse {
  payload: string;
  counter: number;
  /** Сколько миллисекунд осталось до смены кода. */
  expiresInMs: number;
}

type Status = 'loading' | 'live' | 'error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Если сеть отвалилась, пробуем чаще обычного цикла смены кода. */
const RETRY_DELAY_MS = 3000;

export function TerminalScreen({
  terminalId,
  token,
}: {
  terminalId: string;
  token: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const fetchCode = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/attendance/terminal/${terminalId}/code?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      );

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Токен терминала недействителен. Выпустите новый в панели администратора.'
            : 'Сервер недоступен',
        );
      }

      const code = (await response.json()) as CodeResponse;

      if (canvasRef.current) {
        // Рисуем крупно и контрастно: код считывают с расстояния метра-полутора,
        // часто через защитную плёнку на мониторе.
        await QRCode.toCanvas(canvasRef.current, code.payload, {
          width: 420,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      }

      setStatus('live');
      setError(null);
      setSecondsLeft(Math.ceil(code.expiresInMs / 1000));

      // Следующий запрос — к моменту смены окна, плюс небольшой запас,
      // чтобы не поймать границу и не показать уже просроченный код.
      timerRef.current = setTimeout(fetchCode, code.expiresInMs + 250);
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка');
      timerRef.current = setTimeout(fetchCode, RETRY_DELAY_MS);
    }
  }, [terminalId, token]);

  useEffect(() => {
    void fetchCode();
    return () => clearTimeout(timerRef.current);
  }, [fetchCode]);

  // Обратный отсчёт до смены кода — чтобы было видно, что экран живой,
  // а не завис на старой картинке.
  useEffect(() => {
    if (status !== 'live') return;
    const tick = setInterval(() => {
      setSecondsLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [status]);

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Отметка прихода</h1>
      <p style={styles.subtitle}>Откройте приложение CorpSol и отсканируйте код</p>

      <div style={styles.frame}>
        <canvas ref={canvasRef} style={{ display: status === 'live' ? 'block' : 'none' }} />
        {status !== 'live' ? (
          <div style={styles.placeholder}>
            {status === 'loading' ? 'Загрузка кода…' : 'Код недоступен'}
          </div>
        ) : null}
      </div>

      {status === 'live' ? (
        <p style={styles.counter}>Код обновится через {secondsLeft} с</p>
      ) : null}

      {error ? <p style={styles.error}>{error}</p> : null}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
    textAlign: 'center',
  },
  title: { fontSize: 40, margin: 0, fontWeight: 700 },
  subtitle: { fontSize: 20, color: 'var(--text-muted)', margin: 0 },
  frame: {
    background: '#ffffff',
    borderRadius: 24,
    padding: 24,
    minWidth: 468,
    minHeight: 468,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { color: '#64748b', fontSize: 20 },
  counter: { fontSize: 20, color: 'var(--text-muted)', margin: 0 },
  error: { color: 'var(--danger)', fontSize: 18, maxWidth: 520, lineHeight: 1.5 },
};
