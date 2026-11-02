import { BitrixClient, DEALS_MAX_PAGES, isValidWebhook, maskWebhook } from '../src/calls/bitrix-client';
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

describe('выгрузка сделок', () => {
  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((handler: () => void) => {
      handler();
      return 0;
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const deal = (id: string) => ({ ID: id, STAGE_SEMANTIC_ID: 'S', ASSIGNED_BY_ID: '17', DATE_CREATE: '2026-10-01T10:00:00+05:00' });

  it('берёт сделки, изменённые с точки продолжения, со всех страниц', async () => {
    const { calls } = mockFetch([{ result: [deal('1')] as never, next: 50 }, { result: [deal('2')] as never }]);

    const { records, truncated } = await new BitrixClient().fetchDeals(WEBHOOK, new Date('2026-10-01T00:00:00Z'));

    expect(records.map((item) => item.ID)).toEqual(['1', '2']);
    expect(truncated).toBe(false);
    const first = new URL(calls[0]);
    expect(first.pathname).toBe('/rest/1/s3cr3ttoken42/crm.deal.list.json');
    expect(first.searchParams.get('filter[>=DATE_MODIFY]')).toBe('2026-10-01T00:00:00.000Z');
    expect(first.searchParams.get('order[DATE_MODIFY]')).toBe('ASC');
    expect(new URL(calls[1]).searchParams.get('start')).toBe('50');
  });

  it('просит только нужные поля, а не всю карточку сделки', async () => {
    const { calls } = mockFetch([{ result: [] }]);

    await new BitrixClient().fetchDeals(WEBHOOK);

    const fields = new URL(calls[0]).searchParams.getAll('select[]');
    expect(fields).toEqual(expect.arrayContaining(['ID', 'STAGE_SEMANTIC_ID', 'ASSIGNED_BY_ID', 'OPPORTUNITY', 'CLOSEDATE']));
    expect(new URL(calls[0]).searchParams.has('filter[>=DATE_MODIFY]')).toBe(false);
  });

  it('ошибка портала — без адреса вебхука в тексте', async () => {
    mockFetch([{ error: 'insufficient_scope' }]);

    const error = (await new BitrixClient().fetchDeals(WEBHOOK).catch((cause: Error) => cause)) as Error;

    expect(error.message).toBe('Bitrix24: insufficient_scope');
    expect(error.message).not.toContain('s3cr3t');
  });
});

describe('предел добора сделок за один вызов', () => {
  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((handler: () => void) => {
      handler();
      return 0;
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('после предела страниц останавливается и сообщает, что выгружено не всё', async () => {
    let start = 0;
    const fake = jest.fn(async () => {
      start += 50;
      return { ok: true, status: 200, json: async () => ({ result: [{ ID: String(start) }], next: start }) } as Response;
    });
    global.fetch = fake as unknown as typeof fetch;

    const { truncated } = await new BitrixClient().fetchDeals(WEBHOOK);

    expect(truncated).toBe(true);
    expect(fake).toHaveBeenCalledTimes(DEALS_MAX_PAGES);
  });
});
