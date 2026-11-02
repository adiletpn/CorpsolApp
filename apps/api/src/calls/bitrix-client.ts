import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';

import type { BitrixDeal } from '../offers/bitrix-deals';
import type { BitrixCallRecord } from './bitrix-mapper';

/**
 * Клиент REST API Bitrix24 поверх вебхука.
 *
 * Адрес вебхука — это фактически пароль от портала: кто его знает, тот
 * читает и меняет данные компании. Поэтому он никогда не попадает ни
 * в журнал, ни в ответы API — наружу уходит только замаскированный вид.
 */

/**
 * Предел страниц за одну синхронизацию.
 *
 * Постраничный обход идёт по значению `next` из ответа портала. Если оно
 * вернётся неожиданным — например, перестанет расти, — цикл крутился бы
 * бесконечно, выедая лимиты. Предел делает такой сбой заметным и конечным.
 */
const MAX_PAGES = 200;

/**
 * Предел страниц добора сделок за один вызов — 1000 сделок, около полутора
 * минут: большой портал отвечает по несколько секунд на страницу, и месяц
 * сделок отдела (10 тысяч) за один запрос не успевал. Остаток доберёт
 * следующий вызов с точки, где остановился этот; обычный час — это
 * десятки сделок, с большим запасом.
 */
export const DEALS_MAX_PAGES = 20;

/** Только нужные поля: без select портал отдаёт десятки полей сделки. */
const DEAL_FIELDS = [
  'ID',
  'TITLE',
  'OPPORTUNITY',
  'CURRENCY_ID',
  'STAGE_ID',
  'STAGE_SEMANTIC_ID',
  'ASSIGNED_BY_ID',
  'DATE_CREATE',
  'CLOSEDATE',
  'DATE_MODIFY',
];

/** Портал ограничивает частоту запросов, поэтому между страницами пауза. */
const PAGE_DELAY_MS = 350;

interface BitrixResponse<T = BitrixCallRecord> {
  result?: T[];
  total?: number;
  next?: number;
  error?: string;
  error_description?: string;
}

export interface FetchCallsOptions {
  webhookUrl: string;
  /** Нижняя граница выборки — для доборной синхронизации. */
  fromDate?: Date;
  toDate?: Date;
}

export interface FetchCallsResult {
  records: BitrixCallRecord[];
  pagesFetched: number;
  /** Достигнут ли предел страниц: значит, выгружено не всё. */
  truncated: boolean;
}

/** Показывает вебхук так, чтобы его можно было узнать, но не использовать. */
export function maskWebhook(url: string): string {
  const match = url.match(/^(https?:\/\/[^/]+)\/rest\/(\d+)\/([^/]+)/);
  if (!match) return 'некорректный адрес';

  const [, host, userId, token] = match;
  return `${host}/rest/${userId}/${token.slice(0, 3)}…`;
}

export function isValidWebhook(url: string): boolean {
  return /^https:\/\/[\w.-]+\/rest\/\d+\/[\w]+\/?$/.test(url.trim());
}

@Injectable()
export class BitrixClient {
  private readonly logger = new Logger(BitrixClient.name);

  /**
   * Выгружает статистику звонков постранично.
   *
   * Метод `voximplant.statistic.get` отдаёт по 50 записей и сообщает
   * смещение следующей страницы в поле `next`.
   */
  async fetchCalls(options: FetchCallsOptions): Promise<FetchCallsResult> {
    const params = new URLSearchParams();
    params.set('order[CALL_START_DATE]', 'ASC');
    if (options.fromDate) params.set('filter[>=CALL_START_DATE]', options.fromDate.toISOString());
    if (options.toDate) params.set('filter[<=CALL_START_DATE]', options.toDate.toISOString());

    return this.fetchAll<BitrixCallRecord>(options.webhookUrl, 'voximplant.statistic.get', params);
  }

  /**
   * Сделки, изменённые с заданного момента. Фильтр по дате изменения, а не
   * создания: сделку, заведённую в сентябре и закрытую в октябре, нужно
   * увидеть в октябре — именно тогда она стала регистрацией.
   */
  async fetchDeals(
    webhookUrl: string,
    modifiedSince?: Date,
    assignedTo?: string[],
  ): Promise<{ records: BitrixDeal[]; truncated: boolean }> {
    const params = new URLSearchParams();
    params.set('order[DATE_MODIFY]', 'ASC');
    if (modifiedSince) params.set('filter[>=DATE_MODIFY]', modifiedSince.toISOString());
    // Только сделки привязанных сотрудников: в портале их сотни тысяч,
    // а нужны — наших менеджеров. Остальные выкачивать незачем.
    for (const id of assignedTo ?? []) params.append('filter[@ASSIGNED_BY_ID][]', id);
    for (const field of DEAL_FIELDS) params.append('select[]', field);

    const { records, truncated } = await this.fetchAll<BitrixDeal>(webhookUrl, 'crm.deal.list', params, DEALS_MAX_PAGES);
    return { records, truncated };
  }

  /**
   * Постраничный обход метода портала: по 50 записей, смещение следующей
   * страницы — в поле `next`.
   */
  private async fetchAll<T>(
    rawWebhookUrl: string,
    method: string,
    params: URLSearchParams,
    maxPages = MAX_PAGES,
  ): Promise<{ records: T[]; pagesFetched: number; truncated: boolean }> {
    const webhookUrl = rawWebhookUrl.trim().replace(/\/$/, '');
    if (!isValidWebhook(webhookUrl)) {
      throw new BadRequestException('Некорректный адрес вебхука Bitrix24');
    }

    const records: T[] = [];
    let start = 0;
    let pagesFetched = 0;

    while (pagesFetched < maxPages) {
      const page = await this.fetchPage<T>(webhookUrl, method, params, start);
      pagesFetched += 1;

      records.push(...(page.result ?? []));

      // Портал не прислал смещение — страницы кончились.
      if (page.next === undefined || page.next === null) {
        return { records, pagesFetched, truncated: false };
      }

      // Смещение обязано расти. Если нет — это сбой на стороне портала,
      // и продолжать значит крутиться на одной странице бесконечно.
      if (page.next <= start) {
        this.logger.warn(
          `Bitrix24 вернул неувеличивающееся смещение (${page.next} после ${start}), обход остановлен`,
        );
        return { records, pagesFetched, truncated: true };
      }

      start = page.next;
      await this.delay(PAGE_DELAY_MS);
    }

    this.logger.warn(
      `Достигнут предел в ${maxPages} страниц. Выгружено ${records.length} записей, возможно не всё.`,
    );
    return { records, pagesFetched, truncated: true };
  }

  private async fetchPage<T>(
    webhookUrl: string,
    method: string,
    base: URLSearchParams,
    start: number,
  ): Promise<BitrixResponse<T>> {
    const params = new URLSearchParams(base);
    params.set('start', String(start));

    const url = `${webhookUrl}/${method}.json?${params.toString()}`;

    const response = await fetch(url, { method: 'GET' }).catch(() => {
      // В текст ошибки адрес не попадает: он содержит токен портала.
      throw new BadGatewayException('Не удалось связаться с порталом Bitrix24');
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Портал Bitrix24 ответил с ошибкой ${response.status}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as BitrixResponse<T>;

    if (payload.error) {
      throw new BadGatewayException(
        `Bitrix24: ${payload.error_description ?? payload.error}`,
      );
    }

    return payload;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export { MAX_PAGES };
