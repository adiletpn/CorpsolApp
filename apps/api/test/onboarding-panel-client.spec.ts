import { PanelApiError, PanelClient, signIn } from '../src/onboarding/panel-client';

const reply = (status: number, body: unknown) =>
  ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body }) as Response;

describe('клиент API панели', () => {
  it('запросы идут с токеном администратора и телом в JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply(200, { id: 'dep-1', name: 'Кванта', head: null }));
    const client = new PanelClient('https://api.example.kz/api/', 'token-1', fetchMock);

    await client.createDepartment('Кванта');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.kz/api/departments');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body)).toEqual({ name: 'Кванта' });
  });

  it('отказ сервера — с его текстом и путём запроса', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply(409, { message: 'Такой email уже зарегистрирован' }));
    const client = new PanelClient('https://api.example.kz/api', 'token-1', fetchMock);

    const error = await client
      .createEmployee({ email: 'dias@corpsol.kz', fullName: 'Диас', role: 'MOP', departmentId: 'd', officeId: null })
      .catch((cause) => cause);

    expect(error).toBeInstanceOf(PanelApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe('POST /employees: Такой email уже зарегистрирован');
  });

  it('офис не задан — поле не уходит вовсе, а не пустым', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply(201, { id: 'u1' }));
    const client = new PanelClient('https://api.example.kz/api', 't', fetchMock);

    await client.createEmployee({ email: 'a@corpsol.kz', fullName: 'А', role: 'MOP', departmentId: 'd', officeId: null });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('officeId');
  });

  it('добор звонков с даты — момент в ISO', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply(200, { fetched: 1, imported: 1, withoutEmployee: 0, unmatched: [] }));
    const client = new PanelClient('https://api.example.kz/api', 't', fetchMock);

    await client.sync('kcell', new Date('2026-09-30T19:00:00Z'));

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.kz/api/calls/integrations/kcell/sync');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ since: '2026-09-30T19:00:00.000Z' });
  });

  it('вход администратора отдаёт токен, неверный пароль — понятная ошибка', async () => {
    const ok = jest.fn().mockResolvedValue(reply(200, { idToken: 'id-token' }));
    expect(await signIn('key', 'admin@corpsol.kz', 'secret', ok)).toBe('id-token');

    const wrong = jest.fn().mockResolvedValue(reply(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }));
    await expect(signIn('key', 'admin@corpsol.kz', 'nope', wrong)).rejects.toThrow('Вход не удался: INVALID_LOGIN_CREDENTIALS');
  });
});
