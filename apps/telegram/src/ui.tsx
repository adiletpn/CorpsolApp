import React from 'react';

/**
 * Элементы экранов — веб-двойники виджетов приложения на Flutter
 * (widgets/ui.dart, figures.dart, list.dart). Названия те же, чтобы
 * правку в одном легко было найти в другом.
 */

/** Иконка из набора Material Symbols — того же, что у Flutter. */
export function Icon({ name, style }: { name: string; style?: React.CSSProperties }) {
  return (
    <span className="icon" aria-hidden="true" style={style}>
      {name}
    </span>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="header">
      <div className="header-main">
        <h1 className="header-title">{title}</h1>
        {subtitle ? <p className="header-subtitle">{subtitle}</p> : null}
      </div>
      {trailing}
    </header>
  );
}

/** Главное число экрана на градиенте. Одно на экран. */
export function HeroFigure({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: string;
}) {
  return (
    <section className="hero">
      <div className="hero-top">
        <span className="hero-label">{label}</span>
        {icon ? <Icon name={icon} /> : null}
      </div>
      <div className="hero-value">{value}</div>
      {caption ? <p className="hero-caption">{caption}</p> : null}
    </section>
  );
}

/** Ряд чисел одной группой, разделённых волосяными линиями. */
export function FigureRow({ children }: { children: React.ReactNode }) {
  return <div className="figure-row">{children}</div>;
}

/** Цвет даётся только значимым числам: опозданиям, прогулам. */
export function Figure({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="figure">
      <div className="figure-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="figure-label">{label}</div>
    </div>
  );
}

export function SectionLabel({
  children,
  trailing,
  id,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  /** Цель прокрутки для строки разделов вверху экрана. */
  id?: string;
}) {
  return (
    <div className="section-label" id={id}>
      <span>{children}</span>
      {trailing}
    </div>
  );
}

/** Одна рамка на группу строк, а не на каждую строку. */
export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="panel">{children}</div>;
}

export function PanelRow({
  title,
  subtitle,
  trailing,
  accent,
  leading,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Цветная засечка слева — только на отклонениях. */
  accent?: string;
  /** Значок перед строкой — когда тип записи важнее засечки. */
  leading?: React.ReactNode;
}) {
  return (
    <div className="panel-row">
      {accent ? <span className="panel-row-accent" style={{ background: accent }} /> : null}
      {leading}
      <div className="panel-row-main">
        <div className="panel-row-title">{title}</div>
        {subtitle ? <div className="panel-row-subtitle">{subtitle}</div> : null}
      </div>
      {trailing}
    </div>
  );
}

export function RowValue({ children, color, muted }: { children: React.ReactNode; color?: string; muted?: boolean }) {
  return (
    <span className={`row-value ${muted ? 'is-muted' : ''}`} style={color ? { color } : undefined}>
      {children}
    </span>
  );
}

export function EmptyState({ message, icon = 'inbox' }: { message: string; icon?: string }) {
  return (
    <div className="state">
      <Icon name={icon} />
      <p>{message}</p>
    </div>
  );
}

export function ErrorRetry({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div className="state is-error">
      <Icon name="cloud_off" />
      <p>{message}</p>
      <button className="filled-button is-primary" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Загрузка" />;
}

export function Message({
  tone,
  icon,
  children,
}: {
  tone: 'danger' | 'success' | 'muted';
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`message is-${tone}`}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export const Gap = ({ size = 2 }: { size?: 1 | 2 | 3 }) => <div className={`gap-${size}`} />;

/** Цвета палитры для засечек и чисел — те же токены, что в styles.css. */
export const tone = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  faint: 'var(--text-faint)',
  muted: 'var(--text-muted)',
};

/**
 * Заставка, пока открывается сессия. Та же разметка стоит в index.html
 * до загрузки скриптов — смена одной на другую не видна глазу.
 */
export function Splash() {
  return (
    <div className="splash">
      <div className="splash-mark">C</div>
      <div className="splash-name">CorpSol</div>
      <div className="splash-bar" />
    </div>
  );
}
