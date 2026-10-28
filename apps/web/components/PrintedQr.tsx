'use client';

import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';

import { Button, Card } from './ui';

/**
 * Листок с QR для двери офиса. Печатается только сам листок: остальная
 * панель на бумаге скрыта правилом .print-sheet в globals.css.
 *
 * Код не протухает — от отметки по фото листка из дома защищает
 * геозона. Новая печать отменяет прежний листок.
 */
export function PrintedQr({
  payload,
  version,
  terminalName,
  officeName,
  onClose,
}: {
  payload: string;
  version: number;
  terminalName: string;
  officeName: string;
  onClose(): void;
}) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Высокая коррекция ошибок: листок мнётся и выгорает на двери.
    void QRCode.toDataURL(payload, { width: 640, margin: 2, errorCorrectionLevel: 'H' }).then((url) => {
      if (!cancelled) setImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <Card title="QR для двери">
      <p style={styles.note}>
        Распечатайте и повесьте у входа. Прежний листок этого терминала больше не работает.
      </p>

      <div className="print-sheet" style={styles.sheet}>
        <div style={styles.heading}>Отметка прихода</div>
        <div style={styles.sub}>
          Наведите камеру телефона на код — откроется CorpSol в Telegram и отметит приход
        </div>
        {image ? <img src={image} alt={`QR терминала ${terminalName}`} style={styles.qr} /> : null}
        <div style={styles.footer}>
          {officeName} · {terminalName} · печать №{version}
        </div>
      </div>

      <div style={styles.actions}>
        <Button onClick={() => window.print()} disabled={!image}>
          Печать
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Скрыть
        </Button>
      </div>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  note: { color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 },
  sheet: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 24,
    background: '#ffffff',
    color: '#111111',
    borderRadius: 12,
    maxWidth: 420,
  },
  heading: { fontSize: 28, fontWeight: 800 },
  sub: { fontSize: 14, textAlign: 'center' },
  qr: { width: '100%', maxWidth: 360, height: 'auto' },
  footer: { fontSize: 12, color: '#555555' },
  actions: { display: 'flex', gap: 8, marginTop: 12 },
};
