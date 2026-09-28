import { normalizePhone } from '@corpsol/shared';

import type { ImportedCall, ImportReport } from './types';

/**
 * Преобразование ответа Bitrix24 (метод `voximplant.statistic.get`)
 * в общий вид звонка.
 *
 * Выделено в чистую функцию намеренно: так поведение проверяется тестами
 * на реальных формах ответа, без обращения к порталу и без учётных данных.
 */

/** Запись звонка, как её отдаёт портал. Поля приходят строками. */
export interface BitrixCallRecord {
  ID?: string | number;
  CALL_ID?: string;
  PORTAL_USER_ID?: string | number;
  PHONE_NUMBER?: string;
  PORTAL_NUMBER?: string;
  CALL_TYPE?: string | number;
  CALL_DURATION?: string | number;
  CALL_START_DATE?: string;
  CALL_FAILED_CODE?: string | number;
  CALL_RECORD_URL?: string;
}

/**
 * Тип звонка в Bitrix: 1 — исходящий, 2 — входящий,
 * 3 — исходящий с переадресацией, 4 — входящий с переадресацией.
 */
const INBOUND_TYPES = new Set(['2', '4']);

/**
 * Код 200 означает состоявшийся разговор. Остальные — занято, отбой,
 * недоступен. Для плана важен именно разговор, поэтому по коду
 * определяем время разговора, а не по одной длительности.
 */
const SUCCESS_CODE = '200';

function asString(value: string | number | undefined): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function toSeconds(value: string | number | undefined): number {
  const parsed = Number.parseInt(asString(value), 10);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

/**
 * Дата приходит как «2026-09-25T09:15:00+05:00» либо «2026-09-25 09:15:00».
 * Второй вариант без часового пояса разные среды разбирают по-разному,
 * поэтому приводим его к явному виду.
 */
export function parseBitrixDate(value: string | undefined): Date | null {
  const trimmed = asString(value);
  if (trimmed === '') return null;

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function mapBitrixCalls(records: BitrixCallRecord[]): ImportReport {
  const report: ImportReport = { calls: [], rejected: [] };

  records.forEach((record, index) => {
    const line = index + 1;
    const raw = JSON.stringify(record);

    const portalUserId = asString(record.PORTAL_USER_ID);
    if (portalUserId === '') {
      report.rejected.push({ line, reason: 'Звонок не привязан к сотруднику портала', raw });
      return;
    }

    const clientPhone = normalizePhone(record.PHONE_NUMBER);
    if (!clientPhone) {
      report.rejected.push({ line, reason: 'Не распознан номер клиента', raw });
      return;
    }

    const startedAt = parseBitrixDate(record.CALL_START_DATE);
    if (!startedAt) {
      report.rejected.push({ line, reason: 'Не распознана дата звонка', raw });
      return;
    }

    // Идентификатор звонка есть у самого портала, собирать свой не нужно.
    const externalId = asString(record.CALL_ID) || asString(record.ID);
    if (externalId === '') {
      report.rejected.push({ line, reason: 'У звонка нет идентификатора', raw });
      return;
    }

    const durationSeconds = toSeconds(record.CALL_DURATION);
    const answered = asString(record.CALL_FAILED_CODE) === SUCCESS_CODE;

    report.calls.push({
      employeeKey: portalUserId,
      clientPhone,
      direction: INBOUND_TYPES.has(asString(record.CALL_TYPE)) ? 'INBOUND' : 'OUTBOUND',
      startedAt,
      durationSeconds,
      // Неотвеченный звонок мог длиться полминуты гудков. Разговора
      // при этом не было, и в план такие минуты идти не должны.
      talkSeconds: answered ? durationSeconds : 0,
      externalId,
    });
  });

  return report;
}
