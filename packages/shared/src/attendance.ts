import { z } from 'zod';

/**
 * Терминал в офисе показывает QR, который сам меняется каждые QR_PERIOD_SECONDS.
 * Сфотографированный код протухает раньше, чем его успеют переслать коллеге.
 */
export const QR_PERIOD_SECONDS = 30;

/** Сколько соседних окон принимаем — компенсация расхождения часов и задержки сети. */
export const QR_ACCEPTED_DRIFT_WINDOWS = 1;

export const QR_PAYLOAD_VERSION = 1;

export const qrPayloadSchema = z.object({
  v: z.literal(QR_PAYLOAD_VERSION),
  /** Идентификатор терминала, а не офиса: в одном офисе может стоять несколько точек. */
  t: z.string().min(1),
  /** Номер временного окна = floor(unixSeconds / QR_PERIOD_SECONDS). */
  c: z.number().int().nonnegative(),
  /** Усечённый HMAC от (secret, terminalId, counter). */
  s: z.string().min(8),
  /**
   * Печатный код — листок на двери вместо экрана. Тогда c — номер
   * печати: новая печать отменяет старый листок. Подпись у печатного
   * кода своя, живой код за печатный не выдать и наоборот.
   */
  p: z.literal(1).optional(),
});

export type QrPayload = z.infer<typeof qrPayloadSchema>;

export function encodeQrPayload(payload: QrPayload): string {
  return JSON.stringify(payload);
}

export function parseQrPayload(raw: string): QrPayload | null {
  try {
    const parsed = qrPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Длина подписи кода: усечённый HMAC в base64url. */
export const QR_SIGNATURE_LENGTH = 16;

/**
 * Печатный код в виде параметра запуска мини-аппа: «q<печать>-<терминал>-<подпись>».
 * Telegram пускает в startapp только латиницу, цифры, «_» и «-», поэтому
 * не JSON. Подпись отрезается с конца по длине: и в ней, и в имени
 * терминала может встретиться «-».
 */
const START_CODE = new RegExp(`^q(\\d{1,9})-([A-Za-z0-9_-]{1,64})-([A-Za-z0-9_-]{${QR_SIGNATURE_LENGTH}})$`);

export function encodeStartCode(payload: QrPayload): string {
  return `q${payload.c}-${payload.t}-${payload.s}`;
}

/** Параметр startapp из ссылки t.me — её камера телефона открывает в Telegram. */
export function extractStartParam(raw: string): string | null {
  const match = /[?&]startapp=([A-Za-z0-9_-]+)/.exec(raw);
  return match ? match[1] : null;
}

/**
 * Код отметки в любом виде: живой код экрана (JSON), печатный листок
 * ссылкой t.me или сам параметр запуска, который мини-апп получил,
 * когда его открыли камерой.
 */
export function parseCheckInCode(raw: string): QrPayload | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return parseQrPayload(trimmed);

  const match = START_CODE.exec(extractStartParam(trimmed) ?? trimmed);
  if (!match) return null;
  return { v: QR_PAYLOAD_VERSION, c: Number(match[1]), t: match[2], s: match[3], p: 1 };
}

export function currentQrCounter(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / QR_PERIOD_SECONDS);
}

/** Причины отказа в отметке. Клиент показывает по коду понятный текст. */
export const CHECK_IN_REJECTIONS = [
  'qr_invalid',
  'qr_expired',
  'outside_fence',
  'wifi_mismatch',
  'accuracy_too_low',
  'mocked_location',
  'device_not_bound',
  'device_mismatch',
  'already_checked_in',
  'outside_schedule',
  'employee_inactive',
] as const;

export type CheckInRejection = (typeof CHECK_IN_REJECTIONS)[number];

export const CHECK_IN_REJECTION_MESSAGES: Record<CheckInRejection, string> = {
  qr_invalid: 'QR-код не распознан. Отсканируйте код с экрана терминала в офисе.',
  qr_expired: 'Код устарел. Наведите камеру на терминал ещё раз.',
  outside_fence: 'Вы находитесь вне офиса — отметка недоступна.',
  wifi_mismatch: 'Телефон не в офисной сети Wi-Fi — отметка недоступна.',
  accuracy_too_low: 'Не удалось точно определить местоположение. Выйдите ближе к окну и повторите.',
  mocked_location: 'Обнаружена подмена геолокации. Отметка заблокирована.',
  device_not_bound: 'Устройство не привязано к аккаунту. Обратитесь к HR.',
  device_mismatch: 'Аккаунт привязан к другому устройству. Отметка возможна только с него.',
  already_checked_in: 'Приход на сегодня уже отмечен.',
  outside_schedule: 'Отметка вне разрешённого интервала рабочего графика.',
  employee_inactive: 'Учётная запись неактивна.',
};

export const ATTENDANCE_STATUSES = [
  'ON_TIME',
  'LATE',
  'ABSENT',
  'DAY_OFF',
  'EXCUSED',
  'NOT_COUNTED',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface CheckInRequest {
  qr: string;
  lat: number;
  lng: number;
  accuracyMeters: number;
  isMocked?: boolean;
  /** BSSID офисной Wi-Fi сети — второй фактор поверх GPS. */
  wifiBssid?: string;
  capturedAt: string;
}

/**
 * Подписи статусов для человека.
 *
 * Лежат здесь, а не в каждом клиенте: табель читают и в панели, и в
 * приложении, и в выгрузке для бухгалтерии — расхождение в словах между
 * ними выглядит как расхождение в данных.
 */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  ON_TIME: 'Вовремя',
  LATE: 'Опоздание',
  ABSENT: 'Прогул',
  DAY_OFF: 'Выходной',
  EXCUSED: 'Уважительная причина',
  NOT_COUNTED: 'Не засчитан',
};

/**
 * Нижняя граница доли дозвонов по исходящим за день, в базисных пунктах.
 *
 * Менеджер, который пришёл, но не дозванивается до клиентов, день
 * не отработал: такой день не засчитывается и в расчёте идёт как прогул.
 */
export const MIN_DAILY_CALL_RATE_BPS = 7500;

/** Чем поставлена отметка. В выгрузке это главный признак ручного вмешательства. */
export const CHECK_METHOD_LABELS: Record<string, string> = {
  QR: 'Скан QR',
  MANUAL_ADJUSTMENT: 'Правка руководителя',
  AUTO_ABSENCE: 'Проставлено системой',
};
