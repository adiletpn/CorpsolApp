/**
 * Подпись устройства для человека. Клиенты присылают платформу кодом:
 * Flutter — «ios» / «android», мини-апп — «telegram-<платформа клиента>».
 * В панели HR решает по ней, одобрять ли заявку, и «telegram-tdesktop»
 * ему ничего не скажет.
 */
const TELEGRAM_CLIENTS: Record<string, string> = {
  ios: 'iPhone',
  android: 'Android',
  macos: 'Mac',
  tdesktop: 'компьютер',
  weba: 'браузер',
  webk: 'браузер',
  web: 'браузер',
};

export function devicePlatformLabel(platform: string | null | undefined): string {
  if (!platform) return 'Неизвестное устройство';

  if (platform === 'telegram') return 'Telegram';
  if (platform.startsWith('telegram-')) {
    const client = platform.slice('telegram-'.length);
    return `Telegram · ${TELEGRAM_CLIENTS[client] ?? client}`;
  }

  if (platform === 'ios') return 'Приложение · iPhone';
  if (platform === 'android') return 'Приложение · Android';
  return platform;
}
