import { TelegramLinkService } from '../src/attendance/telegram-link.service';

const env = { ...process.env };
const fetchMock = jest.fn();

beforeEach(() => {
  process.env = { ...env, TELEGRAM_BOT_TOKEN: '123:token-value' };
  delete process.env.TELEGRAM_MINIAPP_URL;
  fetchMock.mockReset();
  global.fetch = fetchMock as never;
});

afterAll(() => {
  process.env = env;
});

describe('ссылка на мини-апп для листка', () => {
  it('имя бота берётся у Telegram один раз', async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: true, result: { username: 'corpsol_bot' } }) });
    const links = new TelegramLinkService();

    expect(await links.link('q1-t-x')).toBe('https://t.me/corpsol_bot?startapp=q1-t-x');
    await links.link('q2-t-x');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('своя короткая ссылка мини-аппа важнее имени бота', async () => {
    process.env.TELEGRAM_MINIAPP_URL = 'https://t.me/corpsol_bot/app/';

    expect(await new TelegramLinkService().link('q1-t-x')).toBe('https://t.me/corpsol_bot/app?startapp=q1-t-x');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Telegram не ответил — ссылки нет, печать не падает', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    expect(await new TelegramLinkService().link('q1-t-x')).toBeNull();
  });

  it('без токена бота в Telegram не ходим', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    expect(await new TelegramLinkService().link('q1-t-x')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
