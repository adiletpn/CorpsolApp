import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '@corpsol/shared';
import React, { useState } from 'react';

import type { AttendanceRecord } from './api';
import { dateKey, formatDate, timeLabel } from './format';
import { tap } from './telegram';
import { PanelRow, RowValue, tone } from './ui';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Оттенок дня. Прогул и «не засчитан» — одним цветом: в расчёте это одно. */
const STATUS_TONE: Record<AttendanceStatus, 'success' | 'warning' | 'danger' | 'muted' | 'accent'> = {
  ON_TIME: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  NOT_COUNTED: 'danger',
  DAY_OFF: 'muted',
  EXCUSED: 'accent',
};

/**
 * Табель календарём. Списком по дням отклонения терялись среди
 * обычных смен — сеткой месяц читается одним взглядом, а подробности
 * дня открываются касанием.
 */
export function MonthCalendar({
  records,
  month = new Date(),
  today = dateKey(),
}: {
  records: AttendanceRecord[];
  month?: Date;
  /** «Сегодня» снаружи — чтобы тесты не зависели от даты запуска. */
  today?: string;
}) {
  const byDate = new Map(records.map((record) => [record.workDate, record]));

  // Сразу открыт сегодняшний день, а если его нет — последний отмеченный.
  const latest = [...records].sort((a, b) => b.workDate.localeCompare(a.workDate))[0];
  const [selected, setSelected] = useState<string | null>(
    byDate.has(today) ? today : (latest?.workDate ?? null),
  );

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Неделя с понедельника: getDay() считает с воскресенья.
  const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7;

  const cells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => dateKey(new Date(year, monthIndex, index + 1))),
  ];

  const chosen = selected ? byDate.get(selected) : undefined;

  return (
    <div className="calendar">
      <div className="calendar-grid" role="grid" aria-label="Табель за месяц">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="calendar-weekday">
            {weekday}
          </div>
        ))}
        {cells.map((key, index) => {
          if (!key) return <div key={`gap-${index}`} />;

          const record = byDate.get(key);
          const classes = [
            'calendar-day',
            record ? `is-${STATUS_TONE[record.status]}` : '',
            key === today ? 'is-today' : '',
            key > today ? 'is-future' : '',
            key === selected ? 'is-selected' : '',
          ].join(' ');

          return (
            <button
              key={key}
              className={classes}
              disabled={key > today}
              aria-label={`${formatDate(key)}${record ? `, ${ATTENDANCE_STATUS_LABELS[record.status]}` : ''}`}
              aria-pressed={key === selected}
              onClick={() => {
                tap();
                setSelected(key);
              }}
            >
              {Number(key.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span className="is-success">вовремя</span>
        <span className="is-warning">опоздание</span>
        <span className="is-danger">прогул</span>
        <span className="is-muted">выходной</span>
      </div>

      {selected ? <DayDetails date={selected} record={chosen} /> : null}
    </div>
  );
}

function DayDetails({ date, record }: { date: string; record?: AttendanceRecord }) {
  if (!record) {
    return <PanelRow title={formatDate(date)} subtitle="Отметок нет" trailing={<RowValue muted>—</RowValue>} />;
  }

  const color = {
    success: tone.success,
    warning: tone.warning,
    danger: tone.danger,
    muted: tone.faint,
    accent: tone.accent,
  }[STATUS_TONE[record.status]];

  const subtitle = record.checkInAt
    ? `Приход ${timeLabel(record.checkInAt)} · уход ${timeLabel(record.checkOutAt)}`
    : record.method === 'AUTO_ABSENCE'
      ? 'Не отмечался — прогул проставлен системой'
      : undefined;

  return (
    <PanelRow
      title={formatDate(date)}
      subtitle={subtitle}
      accent={record.status === 'ON_TIME' ? undefined : color}
      trailing={
        <RowValue color={color}>
          {record.status === 'LATE' ? `+${record.lateMinutes} мин` : ATTENDANCE_STATUS_LABELS[record.status]}
        </RowValue>
      }
    />
  );
}
