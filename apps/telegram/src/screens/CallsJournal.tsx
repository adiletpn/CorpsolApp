import React, { useEffect, useState } from 'react';

import { api, type Call } from '../api';
import {
  DAY_PART_LABELS,
  KIND_LABELS,
  PERIOD_LABELS,
  callKind,
  filterCalls,
  groupByDay,
  periodRange,
  type CallPeriod,
  type DayPart,
  type KindFilter,
} from '../calls';
import { percent, plural, timeLabel } from '../format';
import { showBackButton, tap } from '../telegram';
import { EmptyState, ErrorRetry, Gap, Icon, Panel, PanelRow, RowValue, SectionLabel, Spinner } from '../ui';

const CALL_STATUS_LABELS: Record<Call['status'], string> = {
  ANSWERED: 'Отвечен',
  NO_ANSWER: 'Нет ответа',
  BUSY: 'Занято',
  FAILED: 'Сбой',
};

const PERIODS: CallPeriod[] = ['today', 'yesterday', 'week', 'month'];
const KINDS: KindFilter[] = ['all', 'out', 'in', 'missed'];
const DAY_PARTS: DayPart[] = ['all', 'morning', 'day', 'evening'];

interface Journal {
  items: Call[];
  next: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Журнал звонков отдельным экраном — «папкой» из «Работы». Период
 * спрашивается у сервера постранично, остальные фильтры — на месте,
 * по уже загруженному. Закрывается кнопкой «Назад» Telegram.
 */
export function CallsJournal({ onClose }: { onClose(): void }) {
  const [period, setPeriod] = useState<CallPeriod>('month');
  const [kind, setKind] = useState<KindFilter>('all');
  const [dayPart, setDayPart] = useState<DayPart>('all');
  const [query, setQuery] = useState('');
  const [journal, setJournal] = useState<Journal>({ items: [], next: null, loading: true, error: null });
  // Повтор после сбоя: тот же период, новая попытка.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => showBackButton(onClose), [onClose]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    let cancelled = false;
    setJournal({ items: [], next: null, loading: true, error: null });

    const { from, to } = periodRange(period);
    api
      .calls(from, to)
      .then((page) => {
        if (!cancelled) setJournal({ items: page.items, next: page.nextBefore, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setJournal((current) => ({
            ...current,
            loading: false,
            error: cause instanceof Error ? cause.message : 'Не удалось загрузить журнал',
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period, attempt]);

  async function loadMore() {
    if (!journal.next) return;
    const { from, to } = periodRange(period);
    setJournal((current) => ({ ...current, loading: true }));
    try {
      const page = await api.calls(from, to, journal.next);
      setJournal((current) => ({
        items: [...current.items, ...page.items],
        next: page.nextBefore,
        loading: false,
        error: null,
      }));
    } catch (cause) {
      setJournal((current) => ({
        ...current,
        loading: false,
        error: cause instanceof Error ? cause.message : 'Не удалось загрузить журнал',
      }));
    }
  }

  const shown = filterCalls(journal.items, { kind, dayPart, query });
  const answered = shown.filter((call) => call.status === 'ANSWERED').length;
  const countOf = (value: KindFilter) => filterCalls(journal.items, { kind: value, dayPart, query }).length;

  return (
    <>
      <header className="journal-header">
        <button className="icon-button" onClick={onClose} aria-label="Назад к «Работе»">
          <Icon name="arrow_back" />
        </button>
        <h1 className="journal-title">Журнал звонков</h1>
      </header>

      <Gap size={2} />
      <label className="search">
        <Icon name="search" />
        <input
          type="search"
          inputMode="search"
          placeholder="Номер или время, например 701 или 14:"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <Gap size={1} />
      <Chips
        label="Период"
        options={PERIODS}
        labels={PERIOD_LABELS}
        value={period}
        onChange={setPeriod}
      />
      <Gap size={1} />
      <Chips
        label="Вид звонка"
        options={KINDS}
        labels={KIND_LABELS}
        value={kind}
        onChange={setKind}
        counts={journal.loading && journal.items.length === 0 ? undefined : countOf}
      />
      <Gap size={1} />
      <Chips label="Время дня" options={DAY_PARTS} labels={DAY_PART_LABELS} value={dayPart} onChange={setDayPart} />

      <Gap size={2} />
      {journal.items.length === 0 && journal.loading ? (
        <Spinner />
      ) : journal.items.length === 0 && journal.error ? (
        <ErrorRetry message={journal.error} onRetry={() => setAttempt((value) => value + 1)} />
      ) : shown.length === 0 ? (
        <EmptyState
          message={journal.items.length === 0 ? 'За этот период звонков нет' : 'Под фильтр ничего не подошло'}
          icon="call"
        />
      ) : (
        <>
          <p className="journal-summary">
            {shown.length} {plural(shown.length, 'звонок', 'звонка', 'звонков')} · с ответом{' '}
            {percent(answered, shown.length)}%
            {journal.next ? ' · загружены не все' : ''}
          </p>
          {groupByDay(shown).map((day) => (
            <section key={day.key}>
              <Gap size={1} />
              <SectionLabel trailing={<span>{day.calls.length}</span>}>{day.label}</SectionLabel>
              <Panel>
                {day.calls.map((call) => (
                  <CallRow key={call.id} call={call} />
                ))}
              </Panel>
            </section>
          ))}
        </>
      )}

      {journal.next && journal.items.length > 0 ? (
        <>
          <Gap size={2} />
          <button className="load-more" onClick={loadMore} disabled={journal.loading}>
            {journal.loading ? 'Загружаем…' : 'Показать ещё'}
          </button>
        </>
      ) : null}
    </>
  );
}

function Chips<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  counts,
}: {
  label: string;
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange(value: T): void;
  counts?: (value: T) => number;
}) {
  return (
    <div className="chips" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          role="tab"
          aria-selected={value === option}
          className={`chip ${value === option ? 'is-active' : ''}`}
          onClick={() => {
            if (option !== value) tap();
            onChange(option);
          }}
        >
          {labels[option]}
          {counts ? <span className="chip-count"> {counts(option)}</span> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * Значок говорит, что за звонок: исходящий, входящий или без ответа.
 * Подпись «входящий» в строке читали через раз — значок виден сразу.
 */
export function CallRow({ call }: { call: Call }) {
  const answered = call.status === 'ANSWERED';
  const minutes = Math.floor(call.talkSeconds / 60);
  const seconds = String(call.talkSeconds % 60).padStart(2, '0');
  const kind = callKind(call);
  const icon = { missed: 'call_missed_outgoing', in: 'call_received', out: 'call_made' }[kind];
  const label = { missed: 'без ответа', in: 'входящий', out: 'исходящий' }[kind];

  return (
    <PanelRow
      leading={
        <span className={`call-icon is-${kind}`} role="img" aria-label={label}>
          <Icon name={icon} />
        </span>
      }
      title={call.clientPhone}
      subtitle={timeLabel(call.startedAt)}
      trailing={
        answered ? (
          <RowValue>{`${minutes}:${seconds}`}</RowValue>
        ) : (
          <RowValue muted>{CALL_STATUS_LABELS[call.status]}</RowValue>
        )
      }
    />
  );
}
