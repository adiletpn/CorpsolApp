'use client';

import React from 'react';

/** Небольшой набор общих элементов, чтобы экраны выглядели единообразно. */

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.card}>
      {title || action ? (
        <header style={styles.cardHeader}>
          {title ? <h2 style={styles.cardTitle}>{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const palette = {
    primary: {
      background: 'var(--accent)',
      color: '#ffffff',
      boxShadow: '0 8px 24px -10px var(--accent)',
    },
    ghost: {
      background: 'var(--surface-muted)',
      color: 'var(--text)',
      borderColor: 'var(--border)',
    },
    danger: { background: 'var(--danger-soft)', color: 'var(--danger)' },
  }[variant];

  return (
    <button
      {...props}
      style={{ ...styles.button, ...palette, ...(props.disabled ? { opacity: 0.45 } : {}) }}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span style={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...styles.input, ...props.style }} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...styles.input, ...props.style }} />;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  // Мягкая заливка вместо контура: метка читается, но не спорит с цифрами.
  const [color, background] = {
    neutral: ['var(--text-muted)', 'var(--surface-muted)'],
    success: ['var(--success)', 'var(--success-soft)'],
    warning: ['var(--warning)', 'var(--warning-soft)'],
    danger: ['var(--danger)', 'var(--danger-soft)'],
  }[tone];

  return <span style={{ ...styles.badge, color, background }}>{children}</span>;
}

/** Плитка с крупным числом: сводки отчётов собираются из них. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {hint ? <div style={styles.statHint}>{hint}</div> : null}
    </div>
  );
}

/** Ряд плиток, переносящийся на узком экране. */
export function StatsRow({ children }: { children: React.ReactNode }) {
  return <div style={styles.statsRow}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p style={styles.empty}>{children}</p>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p style={styles.error}>{children}</p>;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 12,
  },
  cardTitle: { fontSize: 16, margin: 0, fontWeight: 600, letterSpacing: '-0.01em' },
  button: {
    // По свойствам, а не сокращением: вариант кнопки переопределяет цвет рамки.
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 12,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' },
  fieldHint: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  input: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border-strong)',
    borderRadius: 12,
    padding: '11px 14px',
    color: 'var(--text)',
    fontSize: 15,
    width: '100%',
  },
  badge: {
    display: 'inline-block',
    borderRadius: 999,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  statsRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  stat: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '16px 18px',
    minWidth: 150,
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  statHint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 },
  empty: { color: 'var(--text-muted)', fontSize: 14, margin: 0 },
  error: { color: 'var(--danger)', fontSize: 14, lineHeight: 1.5, margin: '8px 0 0' },
};
