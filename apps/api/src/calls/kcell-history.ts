import type { ImportedCall } from './types';

/**
 * Строка истории звонков API Kcell (GET /history/json).
 *
 * Поля и их странности проверены на живом кабинете в мониторинге
 * операторов (MonitorSipuni/providers/kcell.py): у недозвона ключа
 * duration нет вовсе, у пропущенного на отдел нет ключа user.
 */
export interface KcellHistoryRow {
  uid?: string;
  /** Начало звонка, UTC: «2026-08-10T10:54:42Z». */
  start?: string;
  /** out — исходящий, in — входящий, internal — между сотрудниками. */
  type?: string;
  /** success — разговор состоялся, noanswer — исходящий недозвон, missed — пропущенный входящий. */
  status?: string;
  /** Логин сотрудника в АТС. */
  user?: string;
  user_name?: string;
  /** Номер клиента. */
  client?: string;
  /** Наша линия, через которую шёл звонок. */
  diversion?: string;
  /** Секунды разговора — только у состоявшихся. */
  duration?: number | string;
  /** Секунды ожидания до ответа. */
  wait?: number | string;
}

export interface KcellMapResult {
  calls: ImportedCall[];
  /** Пропущенные на отдел: ни на кого не положить. */
  withoutEmployee: number;
  /** Внутренние звонки между сотрудниками — не работа с клиентом. */
  internal: number;
  /** Без uid или времени — не разобрать. */
  invalid: number;
}

const toSeconds = (value: number | string | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

/**
 * История Kcell → звонки для импорта.
 *
 * Сотрудник опознаётся логином АТС (привязка KCELL_USER). Разговор —
 * только при status «success»: у остальных duration нет, и звонок
 * ложится как недозвон. Неизвестный статус Kcell мог добавить позже —
 * такой звонок тоже недозвон, но не теряется.
 */
export function mapKcellHistory(rows: unknown): KcellMapResult {
  const result: KcellMapResult = { calls: [], withoutEmployee: 0, internal: 0, invalid: 0 };
  if (!Array.isArray(rows)) return result;

  // Пагинации у history/json нет, и дубль в ответе не исключён
  // документацией — снимаем по uid.
  const seen = new Set<string>();

  for (const row of rows as KcellHistoryRow[]) {
    const uid = row?.uid ? String(row.uid) : '';
    const startedAt = row?.start ? new Date(row.start) : null;

    if (!uid || !startedAt || Number.isNaN(startedAt.getTime())) {
      result.invalid += 1;
      continue;
    }
    if (seen.has(uid)) continue;
    seen.add(uid);

    if (row.type !== 'out' && row.type !== 'in') {
      result.internal += 1;
      continue;
    }

    const user = (row.user ?? '').trim();
    if (!user) {
      result.withoutEmployee += 1;
      continue;
    }

    const talkSeconds = String(row.status ?? '').toLowerCase() === 'success' ? toSeconds(row.duration) : 0;

    result.calls.push({
      employeeKey: user,
      clientPhone: String(row.client ?? ''),
      direction: row.type === 'out' ? 'OUTBOUND' : 'INBOUND',
      startedAt,
      durationSeconds: toSeconds(row.wait) + talkSeconds,
      talkSeconds,
      externalId: uid,
    });
  }

  return result;
}
