import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';

/**
 * Клиент REST API виртуальной АТС Kcell (corpsol.vpbx.kcell.kz/crmapi/v1).
 *
 * Ключ API — доступ ко всем звонкам компании, поэтому он не попадает
 * ни в журнал, ни в текст ошибок, ни в ответы панели.
 */

/** Сколько ждём ответа: история за день — сотни записей одним ответом. */
const TIMEOUT_MS = 20_000;

export interface KcellCredentials {
  baseUrl: string;
  apiKey: string;
}

/** Kcell ждёт моменты в UTC без разделителей: 20260810T105442Z. */
export function formatKcellMoment(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Адрес API кабинета: https://<компания>.vpbx.kcell.kz/crmapi/v1. */
export function isValidKcellBaseUrl(url: string): boolean {
  return /^https:\/\/[\w.-]+\.kcell\.kz\/crmapi\/v\d+\/?$/.test(url.trim());
}

/** Ключ так, чтобы его можно было узнать, но не использовать. */
export function maskKey(key: string): string {
  return key.length <= 6 ? '•••' : `${key.slice(0, 3)}…${key.slice(-2)}`;
}

@Injectable()
export class KcellApiClient {
  /**
   * История звонков за отрезок. Пагинации у метода нет: за день
   * в живом кабинете приходит до полутысячи записей одним массивом.
   */
  async fetchHistory(credentials: KcellCredentials, from: Date, to: Date): Promise<unknown> {
    const baseUrl = credentials.baseUrl.trim().replace(/\/$/, '');
    if (!isValidKcellBaseUrl(baseUrl)) {
      throw new BadRequestException('Некорректный адрес API Kcell');
    }

    const params = new URLSearchParams({
      start: formatKcellMoment(from),
      end: formatKcellMoment(to),
      type: 'all',
    });

    const response = await fetch(`${baseUrl}/history/json?${params.toString()}`, {
      headers: { 'X-API-KEY': credentials.apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => {
      throw new BadGatewayException('Не удалось связаться с API Kcell');
    });

    if (response.status === 401 || response.status === 403) {
      throw new BadGatewayException('API Kcell отклонил ключ — проверьте его в кабинете АТС');
    }
    if (!response.ok) {
      throw new BadGatewayException(`API Kcell ответил с ошибкой ${response.status}`);
    }

    return response.json().catch(() => {
      throw new BadGatewayException('API Kcell вернул не JSON');
    });
  }
}
