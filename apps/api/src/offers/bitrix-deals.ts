import { localWorkDateKey } from '../common/utils/time';
import type { OfferStatus } from '../firestore/types';

/**
 * Сделка Bitrix24 из crm.deal.list — только поля, которые мы запрашиваем.
 * Портал отдаёт всё строками, даты — ISO со смещением портала.
 */
export interface BitrixDeal {
  ID: string;
  TITLE?: string | null;
  OPPORTUNITY?: string | null;
  CURRENCY_ID?: string | null;
  STAGE_ID?: string | null;
  /** P — в работе, S — успешна, F — провалена. Не зависит от названий стадий. */
  STAGE_SEMANTIC_ID?: string | null;
  ASSIGNED_BY_ID?: string | null;
  DATE_CREATE?: string | null;
  CLOSEDATE?: string | null;
  DATE_MODIFY?: string | null;
}

export interface MappedDeal {
  externalId: string;
  /** Пользователь портала, ответственный за сделку, — ключ к сотруднику. */
  employeeKey: string;
  clientName: string;
  amountMinor: number;
  status: OfferStatus;
  sentAt: Date;
  /** День, на который сделка ложится в план: для успешной — день закрытия. */
  sentDate: string;
  resolvedAt: Date | null;
  modifiedAt: Date | null;
}

const STATUS_BY_SEMANTIC: Record<string, OfferStatus> = { S: 'ACCEPTED', F: 'REJECTED', P: 'SENT' };

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** «145000.50» → 14 500 050 тиынов. Через строку, без ошибок плавающей точки. */
export function toMinor(value?: string | null): number {
  const match = /^\s*(\d+)(?:[.,](\d{1,2}))?/.exec(value ?? '');
  if (!match) return 0;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

export interface DealsMapResult {
  deals: MappedDeal[];
  /** Без ответственного или без даты — разложить не на кого или некуда. */
  rejected: string[];
}

/**
 * Сделки портала в офферы. Регистрация — это сделка в успешной стадии:
 * она закрывает план и даёт недельный бонус в день закрытия, а не в день,
 * когда сделку завели.
 */
export function mapBitrixDeals(records: BitrixDeal[], timezone = 'Asia/Almaty'): DealsMapResult {
  const result: DealsMapResult = { deals: [], rejected: [] };

  for (const record of records) {
    const created = parseDate(record.DATE_CREATE);
    const employeeKey = (record.ASSIGNED_BY_ID ?? '').trim();
    if (!record.ID || !created || !employeeKey) {
      result.rejected.push(record.ID ?? '?');
      continue;
    }

    const status = STATUS_BY_SEMANTIC[(record.STAGE_SEMANTIC_ID ?? 'P').toUpperCase()] ?? 'SENT';
    const modified = parseDate(record.DATE_MODIFY);
    // Дата закрытия у открытой сделки — плановая, а не факт; у закрытой — факт.
    const closed = status === 'SENT' ? null : (parseDate(record.CLOSEDATE) ?? modified ?? created);
    const dayOf = status === 'ACCEPTED' ? closed! : created;

    result.deals.push({
      externalId: record.ID,
      employeeKey,
      clientName: record.TITLE?.trim() || `Сделка №${record.ID}`,
      amountMinor: toMinor(record.OPPORTUNITY),
      status,
      sentAt: created,
      sentDate: localWorkDateKey(dayOf, timezone),
      resolvedAt: closed,
      modifiedAt: modified,
    });
  }

  return result;
}
