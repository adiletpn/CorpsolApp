'use client';

import React, { useId, useMemo, useState } from 'react';

export interface TrendPoint {
  date: string;
  value: number;
}

interface TrendProps {
  title: string;
  points: TrendPoint[];
  /** Подпись значения в подсказке: проценты, деньги, штуки. */
  format: (value: number) => string;
  /** Токен цвета линии. По умолчанию — акцент панели. */
  color?: string;
  /** Верх шкалы, если он задан смыслом: у процентов это сто. */
  max?: number;
}

const WIDTH = 720;
const HEIGHT = 160;
const PADDING = { top: 12, right: 12, bottom: 22, left: 12 };

/** День в виде «5 окт» — на оси нужен ориентир, а не полная дата. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Кривая за период.
 *
 * Одна линия на диаграмму намеренно: посещаемость в процентах и выручка
 * в тенге — разные масштабы, и общая ось исказила бы обе. Две картинки
 * рядом читаются честнее, чем одна с двумя шкалами.
 */
export function Trend({ title, points, format, color = 'var(--accent)', max }: TrendProps) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;

    const top = max ?? Math.max(...points.map((point) => point.value), 1);
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    // Единственная точка встала бы у левого края: ставим её посередине,
    // иначе день выглядит как начало оборвавшейся кривой.
    const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
    const offset = points.length > 1 ? 0 : innerWidth / 2;

    const coords = points.map((point, index) => ({
      ...point,
      x: PADDING.left + offset + index * step,
      y: PADDING.top + innerHeight * (1 - Math.min(point.value, top) / top),
    }));

    return { coords, top, innerHeight };
  }, [points, max]);

  if (!geometry) {
    return (
      <div style={styles.card}>
        <div style={styles.title}>{title}</div>
        <div style={styles.empty}>За период данных нет</div>
      </div>
    );
  }

  const { coords } = geometry;
  const line = coords.map((point) => `${point.x},${point.y}`).join(' ');
  const active = hover === null ? null : coords[hover];

  return (
    <div style={styles.card}>
      <div style={styles.title} id={titleId}>
        {title}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={styles.svg}
        role="img"
        aria-labelledby={titleId}
        // Кривая — это картинка; то же самое доступно таблицей ниже.
        aria-describedby={`${titleId}-summary`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Сетка приглушена: она ориентир, а не содержание. */}
        {[0, 0.5, 1].map((fraction) => {
          const y = PADDING.top + geometry.innerHeight * fraction;
          return (
            <line
              key={fraction}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}

        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {active ? (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={PADDING.top}
              y2={PADDING.top + geometry.innerHeight}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            {/* Кольцо цветом подложки отделяет точку от линии. */}
            <circle cx={active.x} cy={active.y} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </>
        ) : null}

        {/* Зоны наведения шире самих точек: попасть в линию мышью трудно. */}
        {coords.map((point, index) => (
          <rect
            key={point.date}
            x={point.x - 8}
            y={PADDING.top}
            width={16}
            height={geometry.innerHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}

        <text x={PADDING.left} y={HEIGHT - 6} style={styles.axis}>
          {shortDate(coords[0].date)}
        </text>
        {coords.length > 1 ? (
          <text x={WIDTH - PADDING.right} y={HEIGHT - 6} textAnchor="end" style={styles.axis}>
            {shortDate(coords[coords.length - 1].date)}
          </text>
        ) : null}
      </svg>

      <div style={styles.readout} id={`${titleId}-summary`}>
        {active
          ? `${shortDate(active.date)}: ${format(active.value)}`
          : `Последнее значение: ${format(coords[coords.length - 1].value)}`}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { marginBottom: 20 },
  title: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 },
  svg: { width: '100%', height: 'auto', display: 'block' },
  axis: { fontSize: 11, fill: 'var(--text-muted)' },
  empty: { color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' },
  readout: { fontSize: 13, marginTop: 6, color: 'var(--text-muted)' },
};
