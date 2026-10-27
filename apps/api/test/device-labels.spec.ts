import { devicePlatformLabel } from '@corpsol/shared';

describe('подпись устройства в панели', () => {
  it.each([
    ['telegram-ios', 'Telegram · iPhone'],
    ['telegram-android', 'Telegram · Android'],
    ['telegram-macos', 'Telegram · Mac'],
    ['telegram-tdesktop', 'Telegram · компьютер'],
    ['telegram-weba', 'Telegram · браузер'],
    ['telegram', 'Telegram'],
    ['ios', 'Приложение · iPhone'],
    ['android', 'Приложение · Android'],
  ])('%s → «%s»', (platform, label) => {
    expect(devicePlatformLabel(platform)).toBe(label);
  });

  it('неизвестный клиент Telegram показывается как есть', () => {
    // Telegram добавляет клиентов — новый не должен превратиться в пустоту.
    expect(devicePlatformLabel('telegram-vision')).toBe('Telegram · vision');
  });

  it('без платформы — честное «неизвестно»', () => {
    expect(devicePlatformLabel(null)).toBe('Неизвестное устройство');
  });
});
