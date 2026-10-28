import { createHash } from 'node:crypto';
import { BadGatewayException, Injectable } from '@nestjs/common';

/**
 * Клиент статистики Sipuni (https://sipuni.com/api/statistic/export/all).
 *
 * Запрос подписывается md5 от параметров и секрета аккаунта — в строго
 * заданном порядке. Перепутанный порядок Sipuni не объясняет: вместо CSV
 * приходит HTML-страница. Сам секрет в запрос не уходит.
 */

const BASE_URL = 'https://sipuni.com';
const TIMEOUT_MS = 30_000;
/** Сколько последних звонков брать за раз: выгрузка идёт от свежих к старым. */
export const SIPUNI_EXPORT_LIMIT = 5000;

export interface SipuniCredentials {
  user: string;
  secret: string;
}

/** Подпись export/all: md5(«limit+order+page+user+secret»). */
export function signExportAll(limit: number, order: string, page: number, credentials: SipuniCredentials): string {
  return createHash('md5')
    .update(`${limit}+${order}+${page}+${credentials.user}+${credentials.secret}`)
    .digest('hex');
}

@Injectable()
export class SipuniApiClient {
  /** Последние звонки аккаунта CSV-текстом, свежие сверху. */
  async exportAll(credentials: SipuniCredentials, page = 1): Promise<string> {
    const limit = SIPUNI_EXPORT_LIMIT;
    const order = 'desc';

    const body = new URLSearchParams({
      user: credentials.user,
      limit: String(limit),
      order,
      page: String(page),
      hash: signExportAll(limit, order, page, credentials),
    });

    const response = await fetch(`${BASE_URL}/api/statistic/export/all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => {
      throw new BadGatewayException('Не удалось связаться с Sipuni');
    });

    if (!response.ok) {
      throw new BadGatewayException(`Sipuni ответил с ошибкой ${response.status}`);
    }

    const text = await response.text();
    // Неверная подпись или аккаунт — Sipuni отдаёт HTML вместо CSV.
    if (/^\s*<(!doctype|html|!--)/i.test(text)) {
      throw new BadGatewayException('Sipuni вернул страницу вместо выгрузки — проверьте логин и секрет');
    }
    return text;
  }
}
