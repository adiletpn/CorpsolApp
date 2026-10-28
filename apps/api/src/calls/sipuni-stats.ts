import { detectDelimiter, splitLine } from './csv-lines';
import { parseCallDate } from './kcell-parser';
import type { ImportedCall } from './types';

/**
 * Разбор статистики Sipuni (/api/statistic/export/all — CSV через «;»).
 *
 * Поля «сотрудник» в выгрузке нет: человек опознаётся своим внутренним
 * номером внутри текста «Схема» или «Кто ответил» — «Входящая 7475567651
 * Балнур 97», «исход +7707… nom 94». Так же сопоставляет мониторинг
 * операторов (MonitorSipuni/providers/sipuni.py).
 */

const COLUMNS = {
  type: 'тип',
  time: 'время',
  scheme: 'схема',
  from: 'откуда',
  to: 'куда',
  answeredBy: 'кто ответил',
  callSeconds: 'длительность звонка, сек',
  talkSeconds: 'длительность разговора, сек',
  recordId: 'id записи',
} as const;

export interface SipuniMapResult {
  calls: ImportedCall[];
  /** Ни один внутренний номер не нашёлся в строке. */
  withoutEmployee: number;
  /** Ни входящий, ни исходящий — внутренний или служебный. */
  internal: number;
  invalid: number;
}

const toSeconds = (value: string | undefined): number => {
  const parsed = Number((value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

function directionOf(type: string, scheme: string): ImportedCall['direction'] | null {
  const text = `${type} ${scheme}`.toLowerCase();
  if (text.includes('вход')) return 'INBOUND';
  if (text.includes('исход')) return 'OUTBOUND';
  return null;
}

/**
 * Чей это звонок. Номер — отдельным числом: «nom 94» — да, «94» внутри
 * 1940 или в номере клиента — нет. Длинные номера проверяем раньше
 * коротких, чтобы «236» не перехватил «23».
 */
function findExtension(text: string, extensions: string[]): string | null {
  for (const extension of extensions) {
    const pattern = new RegExp(`(?<!\\d)${extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`);
    if (pattern.test(text)) return extension;
  }
  return null;
}

export function mapSipuniExport(csv: string, extensions: string[]): SipuniMapResult {
  const result: SipuniMapResult = { calls: [], withoutEmployee: 0, internal: 0, invalid: 0 };

  // В начале выгрузки BOM — без снятия первый заголовок «Тип» не узнаётся.
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return result;

  const delimiter = detectDelimiter(lines[0]);
  const header = splitLine(lines[0], delimiter).map((cell) => cell.trim().toLowerCase());
  const column = (name: string) => header.indexOf(name);
  const at = Object.fromEntries(Object.entries(COLUMNS).map(([key, name]) => [key, column(name)])) as Record<
    keyof typeof COLUMNS,
    number
  >;

  if (at.time < 0 || at.scheme < 0) return result;

  const ordered = [...new Set(extensions.map((value) => value.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );

  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const cell = (key: keyof typeof COLUMNS) => (at[key] >= 0 ? (cells[at[key]] ?? '') : '');

    const startedAt = parseCallDate(cell('time'));
    if (!startedAt) {
      result.invalid += 1;
      continue;
    }

    const direction = directionOf(cell('type'), cell('scheme'));
    if (!direction) {
      result.internal += 1;
      continue;
    }

    const extension = findExtension(`${cell('scheme')} ${cell('answeredBy')}`.toLowerCase(), ordered);
    if (!extension) {
      result.withoutEmployee += 1;
      continue;
    }

    const talkSeconds = toSeconds(cell('talkSeconds'));

    result.calls.push({
      employeeKey: extension,
      clientPhone: direction === 'INBOUND' ? cell('from') : cell('to'),
      direction,
      startedAt,
      durationSeconds: Math.max(toSeconds(cell('callSeconds')), talkSeconds),
      talkSeconds,
      // Своего ID у звонка в выгрузке нет: время, стороны и ID записи
      // вместе уникальны и одинаковы при повторной выгрузке.
      externalId: [cell('time'), cell('from'), cell('to'), cell('recordId')].join('|'),
    });
  }

  return result;
}
