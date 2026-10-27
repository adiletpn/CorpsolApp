import { MIN_DAILY_CALL_RATE_BPS, type AttendanceStatus } from '@corpsol/shared';
import React, { useState } from 'react';

import { ApiError, api, type AttendanceRecord } from '../api';
import {
  answeredToPass,
  dateKey,
  dayPasses,
  formatDate,
  initialsOf,
  monthRange,
  percent,
  plural,
  timeLabel,
} from '../format';
import { useSession } from '../session';
import {
  LocationError,
  canScanQr,
  haptic,
  openLocationSettings,
  readPosition,
  scanQr,
} from '../telegram';
import {
  EmptyState,
  ErrorRetry,
  Figure,
  FigureRow,
  Gap,
  Icon,
  Message,
  Panel,
  PanelRow,
  RowValue,
  ScreenHeader,
  SectionLabel,
  Spinner,
  tone,
} from '../ui';
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
  // Адрес точки доступа из WebView Telegram не прочитать, поэтому
  // проверку Wi-Fi у офиса нужно выключить.
  wifi_mismatch: 'В офисе включена проверка Wi-Fi — из Telegram она недоступна. Попросите администратора отключить её.',
};

/** Цвет статуса — как attendanceStatusColor во Flutter. */
const STATUS_COLOR: Record<AttendanceStatus, string> = {
  ON_TIME: tone.success,
  LATE: tone.warning,
  ABSENT: tone.danger,
  NOT_COUNTED: tone.danger,
  DAY_OFF: tone.faint,
  EXCUSED: tone.accent,
};

type Notice =
  | { kind: 'busy'; text: string }
  | { kind: 'error'; text: string; hint?: string; settings?: boolean }
  | { kind: 'success'; text: string };

/** Аватар в шапке ведёт в профиль — там тема, награды и выход. */
export function Home({ onOpenProfile }: { onOpenProfile(): void }) {
  const { user } = useSession();
  const today = dateKey();
  const month = monthRange();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [leaving, setLeaving] = useState(false);

  const data = useLoad(async () => {
    const [records, calls] = await Promise.all([
      api.attendance(month.from, month.to),
      api.callsSummary(today, today),
    ]);
    return { records, calls };
  });

  const records = data.data?.records ?? [];
  const todayRecord = records.find((record) => record.workDate === today) ?? null;
  // Свежие смены сверху: вчерашний день нужен чаще, чем первое число месяца.
  const sorted = [...records].sort((a, b) => b.workDate.localeCompare(a.workDate));

  async function checkIn() {
    if (!canScanQr()) {
      setNotice({ kind: 'error', text: 'Отметка — по QR-коду терминала. Откройте приложение в Telegram на телефоне.' });
      return;
    }

    const qr = await scanQr('Отсканируйте QR-код на терминале в офисе');
    if (!qr) return;

    try {
      setNotice({ kind: 'busy', text: 'Определяем местоположение…' });
      const position = await readPosition();

      setNotice({ kind: 'busy', text: 'Подтверждаем приход…' });
      const result = await api.checkIn({ qr, ...position });

      haptic('success');
      setNotice({
        kind: 'success',
        text:
          result.status === 'LATE'
            ? `Приход отмечен с опозданием ${result.lateMinutes} мин · ${result.office.name}`
            : `Приход отмечен вовремя · ${result.office.name}`,
      });
      data.reload();
    } catch (cause) {
      haptic('error');
      if (cause instanceof LocationError) {
        setNotice({ kind: 'error', text: cause.message, settings: cause.canOpenSettings });
      } else if (cause instanceof ApiError) {
        setNotice({ kind: 'error', text: cause.message, hint: cause.code ? CHECK_IN_HINTS[cause.code] : undefined });
      } else {
        setNotice({ kind: 'error', text: 'Нет связи с сервером. Попробуйте ещё раз.' });
      }
    }
  }

  async function checkOut() {
    if (leaving) return;
    setLeaving(true);
    try {
      await api.checkOut();
      haptic('success');
      setNotice(null);
      data.reload();
    } catch (cause) {
      haptic('error');
      setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Нет связи с сервером. Попробуйте ещё раз.' });
    } finally {
      setLeaving(false);
    }
  }

  return (
    <>
      <ScreenHeader
        title={user?.fullName ?? ''}
        subtitle={user?.role === 'ROP' ? 'Руководитель отдела продаж' : 'Менеджер отдела продаж'}
        trailing={
          <button className="avatar-button" onClick={onOpenProfile} aria-label="Профиль">
            {initialsOf(user?.fullName ?? '')}
          </button>
        }
      />
      <Gap size={3} />

      <CheckInCard record={todayRecord} busy={leaving} onScan={checkIn} onCheckOut={checkOut} />

      {notice ? (
        <>
          <Gap size={1} />
          <NoticeView notice={notice} />
        </>
      ) : null}

      <Gap size={1} />
      <MonthSummary records={records} />

      {user?.role === 'MOP' && data.data ? (
        <>
          <Gap size={3} />
          <CallsToday outbound={data.data.calls.outbound} answered={data.data.calls.outboundAnswered} />
        </>
      ) : null}

      <Gap size={3} />
      <SectionLabel>Табель за месяц</SectionLabel>
      {data.error && records.length === 0 ? (
        <ErrorRetry message="Не удалось загрузить табель" onRetry={data.reload} />
      ) : data.loading && records.length === 0 ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <EmptyState message="За этот месяц отметок пока нет" />
      ) : (
        <Panel>
          {sorted.map((record) => (
            <AttendanceRow key={record.id} record={record} />
          ))}
        </Panel>
      )}
    </>
  );
}

/**
 * Отмеченный день не зовёт нажимать: градиент уходит, остаётся
 * спокойная панель со временем и кнопкой ухода.
 */
function CheckInCard({
  record,
  busy,
  onScan,
  onCheckOut,
}: {
  record: AttendanceRecord | null;
  busy: boolean;
  onScan(): void;
  onCheckOut(): void;
}) {
  if (record?.checkInAt) {
    return (
      <Panel>
        <PanelRow
          title="Приход отмечен"
          subtitle={
            record.checkOutAt
              ? `Ушли в ${timeLabel(record.checkOutAt)}. Хорошего вечера`
              : 'Не забудьте отметить уход'
          }
          accent={tone.success}
          trailing={
            record.checkOutAt ? (
              <Icon name="check" style={{ color: tone.success }} />
            ) : (
              <button className="filled-button" onClick={onCheckOut} disabled={busy}>
                {busy ? <div className="spinner is-small" /> : 'Ухожу'}
              </button>
            )
          }
        />
      </Panel>
    );
  }

  // Выходной или уважительная причина: отмечаться сегодня не нужно.
  if (record && record.status !== 'ABSENT') {
    return (
      <Panel>
        <PanelRow title="Сегодня отмечаться не нужно" subtitle={statusNote(record)} accent={STATUS_COLOR[record.status]} />
      </Panel>
    );
  }

  return (
    <button className="gradient-card" onClick={onScan}>
      <div className="scan-row">
        <div className="scan-badge">
          <Icon name="qr_code_scanner" />
        </div>
        <span className="scan-title">Отметить приход</span>
        <Icon name="arrow_forward" />
      </div>
      <p className="scan-caption">Отсканируйте QR-код на терминале в офисе</p>
    </button>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  if (notice.kind === 'busy') {
    return (
      <Message tone="muted" icon="location_searching">
        {notice.text}
      </Message>
    );
  }
  if (notice.kind === 'success') {
    return (
      <Message tone="success" icon="check_circle">
        {notice.text}
      </Message>
    );
  }
  return (
    <Message tone="danger" icon="error">
      <p>{notice.text}</p>
      {notice.hint ? <p className="message-hint">{notice.hint}</p> : null}
      {notice.settings ? (
        <button className="link-button" onClick={openLocationSettings}>
          Открыть настройки геолокации
        </button>
      ) : null}
    </Message>
  );
}

function MonthSummary({ records }: { records: AttendanceRecord[] }) {
  const count = (...statuses: AttendanceStatus[]) =>
    records.filter((record) => statuses.includes(record.status)).length;

  const late = count('LATE');
  // Не засчитанный по дозвонам день в расчёте идёт как прогул.
  const absent = count('ABSENT', 'NOT_COUNTED');

  return (
    <FigureRow>
      <Figure value={String(count('ON_TIME'))} label="вовремя" />
      {/* Цветом помечаем только то, что требует внимания. */}
      <Figure value={String(late)} label="опозданий" color={late > 0 ? tone.warning : undefined} />
      <Figure value={String(absent)} label="прогулов" color={absent > 0 ? tone.danger : undefined} />
    </FigureRow>
  );
}

/**
 * Дозвоны за сегодня — по этому правилу ночью решится, засчитан ли день.
 * Сотрудник видит это заранее, а не наутро.
 */
function CallsToday({ outbound, answered }: { outbound: number; answered: number }) {
  const threshold = MIN_DAILY_CALL_RATE_BPS / 100;
  const passing = dayPasses(outbound, answered);
  const needed = answeredToPass(outbound, answered);

  return (
    <>
      <SectionLabel>Дозвоны сегодня</SectionLabel>
      <Panel>
        <PanelRow
          title={outbound === 0 ? 'Исходящих пока нет' : `${answered} из ${outbound} исходящих`}
          subtitle={
            passing
              ? `День в зачёте — не ниже ${threshold}%`
              : outbound === 0
                ? `День засчитывается при ${threshold}% дозвонов`
                : `До зачёта ещё ${needed} ${plural(needed, 'дозвон', 'дозвона', 'дозвонов')} подряд`
          }
          accent={passing ? undefined : tone.danger}
          trailing={
            <RowValue color={passing ? tone.success : tone.danger}>{percent(answered, outbound)}%</RowValue>
          }
        />
      </Panel>
    </>
  );
}

function statusNote(record: AttendanceRecord): string | undefined {
  switch (record.status) {
    case 'LATE':
      return `Опоздание ${record.lateMinutes} мин`;
    case 'ABSENT':
      return 'Не отмечался';
    case 'NOT_COUNTED':
      return 'Мало дозвонов';
    case 'DAY_OFF':
      return 'Выходной';
    case 'EXCUSED':
      return 'Уважительная';
    case 'ON_TIME':
      return record.checkOutAt ? `до ${timeLabel(record.checkOutAt)}` : undefined;
  }
}

/**
 * Строка табеля. Засечка и подпись статуса — только у отклонений:
 * обычная смена говорит сама за себя временем прихода.
 */
function AttendanceRow({ record }: { record: AttendanceRecord }) {
  const normal = record.status === 'ON_TIME';
  const color = STATUS_COLOR[record.status];

  return (
    <PanelRow
      title={formatDate(record.workDate)}
      subtitle={statusNote(record)}
      accent={normal ? undefined : color}
      trailing={
        record.checkInAt ? (
          <RowValue color={normal ? undefined : color}>{timeLabel(record.checkInAt)}</RowValue>
        ) : (
          <RowValue muted>—</RowValue>
        )
      }
    />
  );
}
