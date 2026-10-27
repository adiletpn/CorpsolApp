import React from 'react';

/**
 * Наглядные элементы экранов: метр-кольцо и составная полоса.
 * Правила — из руководства по визуализации: тонкие метки, зазор 2px
 * между сегментами вместо рамок, подписи цветом текста, а не серии,
 * и легенда со значениями — она же «таблица» для тех, кто не различает цвет.
 */

/** Цвета меток графиков. Зелёный — отдельный токен: в тёмной теме статусный слишком светлый для заливки. */
export const chart = {
  good: 'var(--chart-good)',
  accent: 'var(--accent)',
  bad: 'var(--danger)',
  neutral: 'var(--text-faint)',
};

/**
 * Метр: одно значение против цели. Кольцо, а не полоса — так планы
 * встают сеткой и сравниваются одним взглядом.
 */
export function RingMeter({
  ratio,
  label,
  caption,
  complete,
}: {
  ratio: number;
  label: string;
  caption: string;
  complete: boolean;
}) {
  const size = 76;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(1, ratio));

  return (
    <figure className="ring" aria-label={`${label}: ${Math.round(ratio * 100)}%, ${caption}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke={complete ? chart.good : chart.accent}
          strokeDasharray={`${shown * length} ${length}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-percent">{Math.round(ratio * 100)}%</span>
      <figcaption>
        <span className="ring-label">{label}</span>
        <span className="ring-caption">{caption}</span>
      </figcaption>
    </figure>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Штриховка — второй признак, кроме цвета: для пар, которые путают при дальтонизме. */
  striped?: boolean;
  /** Подпись значения в легенде; по умолчанию — само число. */
  display?: string;
}

/**
 * Часть целого одной полосой. Пустые сегменты не рисуются, но в легенде
 * остаются: «0 отказов» — тоже ответ.
 */
export function StackedBar({ segments, caption }: { segments: Segment[]; caption: string }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  return (
    <div className="stacked">
      <div className="stacked-bar" role="img" aria-label={caption}>
        {total > 0
          ? segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <span
                  key={segment.key}
                  className={`stacked-segment ${segment.striped ? 'is-striped' : ''}`}
                  style={{ flexGrow: segment.value, background: segment.color }}
                />
              ))
          : null}
      </div>
      <ul className="stacked-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span
              className={`stacked-swatch ${segment.striped ? 'is-striped' : ''}`}
              style={{ background: segment.color }}
            />
            <span className="stacked-label">{segment.label}</span>
            <span className="stacked-value">{segment.display ?? segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
