import { KcellApiClient, formatKcellMoment, isValidKcellBaseUrl, maskKey } from '../src/calls/kcell-api-client';

const credentials = { baseUrl: 'https://corpsol.vpbx.kcell.kz/crmapi/v1', apiKey: 'secret-key-123' };

afterEach(() => jest.restoreAllMocks());

describe('API Kcell', () => {
  it('момент — UTC без разделителей, как ждёт Kcell', () => {
    expect(formatKcellMoment(new Date('2026-08-10T10:54:42.123Z'))).toBe('20260810T105442Z');
  });

  it('адрес кабинета проверяется', () => {
    expect(isValidKcellBaseUrl('https://corpsol.vpbx.kcell.kz/crmapi/v1')).toBe(true);
    expect(isValidKcellBaseUrl('http://corpsol.vpbx.kcell.kz/crmapi/v1')).toBe(false);
    expect(isValidKcellBaseUrl('https://evil.example.com/crmapi/v1')).toBe(false);
  });

  it('ключ маскируется', () => {
    expect(maskKey('secret-key-123')).toBe('sec…23');
    expect(maskKey('abc')).toBe('•••');
  });

  it('запрос истории — с ключом в заголовке и отрезком в UTC', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ uid: '1' }]), { status: 200 }));

    const rows = await new KcellApiClient().fetchHistory(
      credentials,
      new Date('2026-08-10T00:00:00Z'),
      new Date('2026-08-10T23:59:59Z'),
    );

    expect(rows).toEqual([{ uid: '1' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/history/json?start=20260810T000000Z&end=20260810T235959Z&type=all');
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe('secret-key-123');
  });

  it('отклонённый ключ — понятная причина, без самого ключа', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 401 }));

    const failure = new KcellApiClient().fetchHistory(credentials, new Date(), new Date());

    await expect(failure).rejects.toThrow('API Kcell отклонил ключ');
    await expect(failure).rejects.not.toThrow(/secret-key/);
  });

  it('сеть недоступна — понятная причина', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(new KcellApiClient().fetchHistory(credentials, new Date(), new Date())).rejects.toThrow(
      'Не удалось связаться с API Kcell',
    );
  });
});
