import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';

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

/** Портал ограничивает частоту запросов, поэтому между страницами пауза. */
const PAGE_DELAY_MS = 350;

interface BitrixResponse {
  result?: BitrixCallRecord[];
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
    const webhookUrl = options.webhookUrl.trim().replace(/\/$/, '');
    if (!isValidWebhook(webhookUrl)) {
      throw new BadRequestException('Некорректный адрес вебхука Bitrix24');
    }

    const records: BitrixCallRecord[] = [];
    let start = 0;
    let pagesFetched = 0;

    while (pagesFetched < MAX_PAGES) {
      const page = await this.fetchPage(webhookUrl, start, options);
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
      `Достигнут предел в ${MAX_PAGES} страниц. Выгружено ${records.length} записей, возможно не всё.`,
    );
    return { records, pagesFetched, truncated: true };
  }

  private async fetchPage(
    webhookUrl: string,
    start: number,
    options: FetchCallsOptions,
  ): Promise<BitrixResponse> {
    const params = new URLSearchParams({ start: String(start) });
    params.set('order[CALL_START_DATE]', 'ASC');

    if (options.fromDate) {
      params.set('filter[>=CALL_START_DATE]', options.fromDate.toISOString());
    }
    if (options.toDate) {
      params.set('filter[<=CALL_START_DATE]', options.toDate.toISOString());
    }

    const url = `${webhookUrl}/voximplant.statistic.get.json?${params.toString()}`;

    const response = await fetch(url, { method: 'GET' }).catch(() => {
      // В текст ошибки адрес не попадает: он содержит токен портала.
      throw new BadGatewayException('Не удалось связаться с порталом Bitrix24');
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Портал Bitrix24 ответил с ошибкой ${response.status}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as BitrixResponse;

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
