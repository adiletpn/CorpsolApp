import { SipuniApiClient, signExportAll } from '../src/calls/sipuni-api-client';

const credentials = { user: '012345', secret: 's3cret' };

afterEach(() => jest.restoreAllMocks());

describe('API Sipuni', () => {
  it('подпись — md5 параметров и секрета в порядке Sipuni', () => {
    // Эталон посчитан отдельно: hashlib.md5(b'5000+desc+1+012345+s3cret').
    expect(signExportAll(5000, 'desc', 1, credentials)).toBe('da75efe1d3832eaaab385141bd782cd9');
  });

  it('секрет в запрос не уходит, только подпись', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('Тип;Время\n', { status: 200 }));

    await new SipuniApiClient().exportAll(credentials);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    expect(url).toBe('https://sipuni.com/api/statistic/export/all');
    expect(body).toContain('user=012345');
    expect(body).toContain('hash=');
    expect(body).not.toContain('s3cret');
  });

  it('HTML вместо CSV — понятная причина', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<!DOCTYPE html><html>', { status: 200 }));

    await expect(new SipuniApiClient().exportAll(credentials)).rejects.toThrow('проверьте логин и секрет');
  });

  it('сеть недоступна — понятная причина', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(new SipuniApiClient().exportAll(credentials)).rejects.toThrow('Не удалось связаться с Sipuni');
  });
});
