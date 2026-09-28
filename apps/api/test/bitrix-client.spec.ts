import { BitrixClient, isValidWebhook, maskWebhook } from '../src/calls/bitrix-client';
import type { BitrixCallRecord } from '../src/calls/bitrix-mapper';

const WEBHOOK = 'https://corp.bitrix24.kz/rest/1/s3cr3ttoken42';

const record = (id: string): BitrixCallRecord => ({
  CALL_ID: id,
  PORTAL_USER_ID: '17',
  PHONE_NUMBER: '+77071112233',
  CALL_TYPE: '1',
  CALL_DURATION: '60',
  CALL_START_DATE: '2026-09-25T09:15:00+05:00',
  CALL_FAILED_CODE: '200',
});

/** Подменяет сеть заранее заданными ответами портала. */
function mockFetch(pages: Array<{ result?: BitrixCallRecord[]; next?: number; error?: string }>) {
  const calls: string[] = [];
  let index = 0;

  const fake = jest.fn(async (url: string) => {
    calls.push(url);
    const page = pages[Math.min(index, pages.length - 1)];
    index += 1;

    return {
      ok: true,
      status: 200,
      json: async () => page,
    } as Response;
  });

  global.fetch = fake as unknown as typeof fetch;
  return { calls };
}

describe('проверка адреса вебхука', () => {
  it('принимает настоящий адрес', () => {
    expect(isValidWebhook(WEBHOOK)).toBe(true);
    expect(isValidWebhook(`${WEBHOOK}/`)).toBe(true);
  });

  it('отвергает мусор и незащищённое соединение', () => {
    expect(isValidWebhook('http://corp.bitrix24.kz/rest/1/token')).toBe(false);
    expect(isValidWebhook('https://corp.bitrix24.kz/')).toBe(false);
    expect(isValidWebhook('просто строка')).toBe(false);
  });
});

describe('маскировка вебхука', () => {
  it('не показывает токен целиком', () => {
    const masked = maskWebhook(WEBHOOK);

    // Вебхук — это доступ к порталу, наружу он уходить не должен.
    expect(masked).not.toContain('s3cr3ttoken42');
    expect(masked).toContain('corp.bitrix24.kz');
  });
});

describe('постраничная выгрузка', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('собирает записи со всех страниц', async () => {
    mockFetch([
      { result: [record('a'), record('b')], next: 50 },
      { result: [record('c')] },
    ]);

    const result = await new BitrixClient().fetchCalls({ webhookUrl: WEBHOOK });

    expect(result.records).toHaveLength(3);
    expect(result.pagesFetched).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('останавливается, когда портал перестаёт присылать смещение', async () => {
    mockFetch([{ result: [record('a')] }]);

    const result = await new BitrixClient().fetchCalls({ webhookUrl: WEBHOOK });

    expect(result.pagesFetched).toBe(1);
  });

  it('не зацикливается, если смещение перестало расти', async () => {
    // Портал упорно возвращает одно и то же смещение.
    mockFetch([{ result: [record('a')], next: 50 }, { result: [record('b')], next: 50 }]);

    const result = await new BitrixClient().fetchCalls({ webhookUrl: WEBHOOK });

    // Без защиты обход крутился бы бесконечно и выел лимиты портала.
    expect(result.truncated).toBe(true);
    expect(result.pagesFetched).toBeLessThan(5);
  });

  it('передаёт границы периода в фильтр', async () => {
    const { calls } = mockFetch([{ result: [] }]);

    await new BitrixClient().fetchCalls({
      webhookUrl: WEBHOOK,
      fromDate: new Date('2026-09-01T00:00:00Z'),
      toDate: new Date('2026-09-30T00:00:00Z'),
    });

    expect(calls[0]).toContain('CALL_START_DATE');
    expect(decodeURIComponent(calls[0])).toContain('2026-09-01');
  });

  it('отклоняет некорректный адрес до обращения в сеть', async () => {
    const { calls } = mockFetch([{ result: [] }]);

    await expect(
      new BitrixClient().fetchCalls({ webhookUrl: 'не адрес' }),
    ).rejects.toThrow();

    expect(calls).toHaveLength(0);
  });

  it('сообщает об ошибке портала, не раскрывая адрес', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: 'QUERY_LIMIT_EXCEEDED', error_description: 'Слишком часто' }),
    })) as unknown as typeof fetch;

    await expect(
      new BitrixClient().fetchCalls({ webhookUrl: WEBHOOK }),
    ).rejects.toThrow(/Слишком часто/);
  });
});
