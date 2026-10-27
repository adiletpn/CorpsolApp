import { ATTENDANCE_STATUS_LABELS, MIN_DAILY_CALL_RATE_BPS, type AttendanceStatus } from '@corpsol/shared';
import React, { useState } from 'react';

import { ApiError, api, type AttendanceRecord } from '../api';
import {
  answeredToPass,
  dateKey,
  dayLabel,
  dayPasses,
  greeting,
  initials,
  monthRange,
  percent,
  plural,
  timeLabel,
  todayTitle,
} from '../format';
import { CheckIcon, ExitIcon, PinIcon, ScanIcon } from '../icons';
import { useSession } from '../session';
import {
  LocationError,
  canScanQr,
  haptic,
  openLocationSettings,
  readPosition,
  scanQr,
} from '../telegram';
import { Badge, Card, Figure, LoadError, Progress, Row, Skeleton } from '../ui';
import { useLoad } from '../useLoad';

/** Подсказки поверх сообщения сервера: что именно сотруднику сделать. */
const CHECK_IN_HINTS: Record<string, string> = {
  outside_fence: 'Подойдите ближе к офису и повторите.',
  accuracy_too_low: 'Выйдите ближе к окну — сигнал GPS слишком слабый.',
  qr_expired: 'Код на экране обновляется каждые 30 секунд — отсканируйте заново.',
  qr_invalid: 'Это не код терминала. Сканируйте код с экрана в офисе.',
  already_checked_in: 'Приход на сегодня уже отмечен.',
  device_not_bound: 'Телефон не закреплён за аккаунтом. Обратитесь к руководителю.',
  device_mismatch: 'Отметка возможна только с телефона, закреплённого за вами.',
  employee_inactive: 'Учётная запись неактивна. Обратитесь к руководителю.',
  // Проверку Wi-Fi Telegram выполнить не может: адрес точки доступа
  // из WebView не прочитать. Поэтому у офиса её нужно выключить.
  wifi_mismatch: 'В офисе включена проверка Wi-Fi — из Telegram она недоступна. Попросите администратора отключить её.',
};

const STATUS_TONE: Record<AttendanceStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'accent'> = {
  ON_TIME: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  NOT_COUNTED: 'danger',
  DAY_OFF: 'neutral',
  EXCUSED: 'accent',
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; step: string }
  | { kind: 'error'; message: string; hint?: string; settings?: boolean }
  | { kind: 'done'; message: string };

export function Today() {
  const { user, signOut } = useSession();
  const today = dateKey();
  const month = monthRange();

  const data = useLoad(async () => {
    const [records, calls] = await Promise.all([
      api.attendance(month.from, month.to),
      api.callsSummary(today, today),
    ]);
    return { records, calls };
  });

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const record = data.data?.records.find((item) => item.workDate === today) ?? null;

  async function checkIn() {
    const qr = await scanQr('Наведите камеру на код на экране терминала');
    if (!qr) return;

    try {
      setPhase({ kind: 'busy', step: 'Определяем местоположение…' });
      const position = await readPosition();

      setPhase({ kind: 'busy', step: 'Подтверждаем приход…' });
      const result = await api.checkIn({ qr, ...position });

      haptic('success');
      setPhase({
        kind: 'done',
        message:
          result.status === 'LATE'
            ? `Приход отмечен с опозданием ${result.lateMinutes} мин · ${result.office.name}`
            : `Приход отмечен вовремя · ${result.office.name}`,
      });
      data.reload();
    } catch (cause) {
      haptic('error');
      if (cause instanceof LocationError) {
        setPhase({ kind: 'error', message: cause.message, settings: cause.canOpenSettings });
      } else if (cause instanceof ApiError) {
        setPhase({ kind: 'error', message: cause.message, hint: cause.code ? CHECK_IN_HINTS[cause.code] : undefined });
      } else {
        setPhase({ kind: 'error', message: 'Нет связи с сервером. Проверьте интернет и повторите.' });
      }
    }
  }

  async function checkOut() {
    try {
      setPhase({ kind: 'busy', step: 'Отмечаем уход…' });
      const result = await api.checkOut();
      haptic('success');
      setPhase({ kind: 'done', message: `Уход отмечен в ${timeLabel(result.checkOutAt)}` });
      data.reload();
    } catch (cause) {
      haptic('error');
      setPhase({ kind: 'error', message: cause instanceof Error ? cause.message : 'Не удалось отметить уход' });
    }
  }

  return (
    <>
      <header className="greeting">
        <div className="avatar">{initials(user?.fullName ?? '')}</div>
        <div className="greeting-text">
          <div className="greeting-hello">{greeting()},</div>
          <div className="greeting-name">{user?.fullName.split(' ')[0] ?? ''}</div>
        </div>
        <button className="icon-button" onClick={signOut} aria-label="Выйти">
          <ExitIcon />
        </button>
      </header>

      <p className="date-line">{todayTitle()}</p>

      {data.error ? <LoadError message={data.error} onRetry={data.reload} /> : null}

      <Card className="hero">
        {data.loading && !data.data ? (
          <Skeleton lines={2} />
        ) : (
          <ShiftState record={record} onCheckIn={checkIn} onCheckOut={checkOut} busy={phase.kind === 'busy'} />
        )}
        <PhaseNote phase={phase} />
      </Card>

      {user?.role === 'MOP' && data.data ? (
        <CallsToday outbound={data.data.calls.outbound} answered={data.data.calls.outboundAnswered} />
      ) : null}

      {data.data ? <Month records={data.data.records} /> : null}
    </>
  );
}

function ShiftState({
  record,
  busy,
  onCheckIn,
  onCheckOut,
}: {
  record: AttendanceRecord | null;
  busy: boolean;
  onCheckIn(): void;
  onCheckOut(): void;
}) {
  if (!record || !record.checkInAt) {
    if (record && record.status !== 'ABSENT') {
      return (
        <div className="shift">
          <Badge tone={STATUS_TONE[record.status]}>{ATTENDANCE_STATUS_LABELS[record.status]}</Badge>
          <p className="shift-caption">Сегодня отмечаться не нужно.</p>
        </div>
      );
    }

    return (
      <div className="shift">
        <div className="shift-label">Смена</div>
        <div className="shift-value">Приход не отмечен</div>
        {canScanQr() ? (
          <button className="button button-primary button-large" onClick={onCheckIn} disabled={busy}>
            <ScanIcon /> Отметить приход
          </button>
        ) : (
          <p className="shift-caption">
            Отметка — по QR-коду терминала. Откройте приложение в Telegram на телефоне.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="shift">
      <div className="shift-row">
        <div>
          <div className="shift-label">Приход</div>
          <div className="shift-value">{timeLabel(record.checkInAt)}</div>
        </div>
        <div>
          <div className="shift-label">Уход</div>
          <div className="shift-value">{timeLabel(record.checkOutAt)}</div>
        </div>
        <Badge tone={STATUS_TONE[record.status]}>
          {record.status === 'LATE'
            ? `Опоздание ${record.lateMinutes} мин`
            : ATTENDANCE_STATUS_LABELS[record.status]}
        </Badge>
      </div>
      {record.checkOutAt ? (
        <p className="shift-caption">
          <CheckIcon size={16} /> Смена закрыта
        </p>
      ) : (
        <button className="button button-ghost button-large" onClick={onCheckOut} disabled={busy}>
          Отметить уход
        </button>
      )}
    </div>
  );
}

function PhaseNote({ phase }: { phase: Phase }) {
  if (phase.kind === 'idle') return null;
  if (phase.kind === 'busy') {
    return (
      <p className="note">
        <span className="spinner" /> {phase.step}
      </p>
    );
  }
  if (phase.kind === 'done') return <p className="note tone-success">{phase.message}</p>;

  return (
    <div className="note note-error">
      <p>{phase.message}</p>
      {phase.hint ? <p className="note-hint">{phase.hint}</p> : null}
      {phase.settings ? (
        <button className="link-button" onClick={openLocationSettings}>
          <PinIcon /> Открыть настройки геолокации
        </button>
      ) : null}
    </div>
  );
}

/**
 * Дозвоны за сегодня — то же правило, по которому ночью решится,
 * засчитан ли день. Сотрудник видит это заранее, а не наутро.
 */
function CallsToday({ outbound, answered }: { outbound: number; answered: number }) {
  const threshold = MIN_DAILY_CALL_RATE_BPS / 100;
  const rate = percent(answered, outbound);
  const passing = dayPasses(outbound, answered);
  const needed = answeredToPass(outbound, answered);

  return (
    <Card title="Дозвоны сегодня" action={<Badge tone={passing ? 'success' : 'danger'}>{passing ? 'День в зачёте' : 'Не в зачёте'}</Badge>}>
      <div className="rate">
        <span className={`rate-value ${passing ? 'tone-success' : 'tone-danger'}`}>{rate}%</span>
        <span className="rate-caption">
          {answered} из {outbound} исходящих
        </span>
      </div>
      <div className="threshold">
        <Progress ratio={rate / 100} tone={passing ? 'success' : 'danger'} />
        <span className="threshold-mark" style={{ left: `${threshold}%` }} />
      </div>
      <p className="muted small">
        {outbound === 0
          ? `Звонков пока нет. День засчитывается при ${threshold}% дозвонов и выше.`
          : passing
            ? `Держите не ниже ${threshold}% до конца дня.`
            : `Ещё ${needed} ${plural(needed, 'успешный звонок', 'успешных звонка', 'успешных звонков')} подряд — и день в зачёте.`}
      </p>
    </Card>
  );
}

function Month({ records }: { records: AttendanceRecord[] }) {
  const count = (...statuses: AttendanceStatus[]) =>
    records.filter((record) => statuses.includes(record.status)).length;

  const late = count('LATE');
  // Не засчитанный по дозвонам день в расчёте идёт как прогул.
  const missed = count('ABSENT', 'NOT_COUNTED');
  const recent = [...records].sort((a, b) => b.workDate.localeCompare(a.workDate)).slice(0, 10);

  return (
    <Card title="Этот месяц">
      <div className="figures">
        <Figure value={String(count('ON_TIME'))} label="вовремя" tone="success" />
        <Figure value={String(late)} label="опозданий" tone={late > 0 ? 'warning' : undefined} />
        <Figure value={String(missed)} label="прогулов" tone={missed > 0 ? 'danger' : undefined} />
      </div>

      {recent.length > 0 ? (
        <div className="list">
          {recent.map((record) => (
            <Row
              key={record.id}
              title={dayLabel(record.workDate)}
              subtitle={
                record.checkInAt
                  ? `${timeLabel(record.checkInAt)} – ${timeLabel(record.checkOutAt)}`
                  : record.method === 'AUTO_ABSENCE'
                    ? 'Не отмечался'
                    : undefined
              }
              trailing={
                <Badge tone={STATUS_TONE[record.status]}>
                  {record.status === 'LATE' ? `+${record.lateMinutes} мин` : ATTENDANCE_STATUS_LABELS[record.status]}
                </Badge>
              }
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
