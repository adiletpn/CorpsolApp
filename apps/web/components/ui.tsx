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
    primary: { background: 'var(--accent)', color: 'var(--background)' },
    ghost: { background: 'var(--surface-muted)', color: 'var(--text)' },
    danger: { background: 'var(--danger)', color: 'var(--background)' },
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
  const color = {
    neutral: 'var(--text-muted)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
  }[tone];

  return <span style={{ ...styles.badge, color, borderColor: color }}>{children}</span>;
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
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 18, margin: 0, fontWeight: 600 },
  button: {
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
  fieldLabel: { fontSize: 13, color: 'var(--text-muted)' },
  fieldHint: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  input: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    color: 'var(--text)',
    fontSize: 15,
    width: '100%',
  },
  badge: {
    display: 'inline-block',
    border: '1px solid',
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  empty: { color: 'var(--text-muted)', fontSize: 14, margin: 0 },
  error: { color: 'var(--danger)', fontSize: 14, lineHeight: 1.5, margin: '8px 0 0' },
};
