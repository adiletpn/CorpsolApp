import React from 'react';

/** Общие элементы экранов. Оформление — в styles.css, здесь только разметка. */

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title || action ? (
        <header className="card-header">
          {title ? <h2 className="card-title">{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Figure({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="figure">
      <div className={`figure-value ${tone ? `tone-${tone}` : ''}`}>{value}</div>
      <div className="figure-label">{label}</div>
    </div>
  );
}

export function Progress({ ratio, tone }: { ratio: number; tone?: 'success' | 'warning' | 'danger' }) {
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="progress">
      <div className={`progress-bar ${tone ? `bg-${tone}` : ''}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Row({
  title,
  subtitle,
  trailing,
  leading,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <div className="row">
      {leading ? <div className="row-leading">{leading}</div> : null}
      <div className="row-main">
        <div className="row-title">{title}</div>
        {subtitle ? <div className="row-subtitle">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="row-trailing">{trailing}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-group" aria-label="Загрузка">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skeleton" />
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div className="load-error">
      <p>{message}</p>
      <button className="button button-ghost" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="screen-title">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}
