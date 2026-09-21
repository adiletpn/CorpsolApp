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

export function currentQrCounter(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / QR_PERIOD_SECONDS);
}

/** Причины отказа в отметке. Клиент показывает по коду понятный текст. */
export const CHECK_IN_REJECTIONS = [
  'qr_invalid',
  'qr_expired',
  'outside_fence',
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
  accuracy_too_low: 'Не удалось точно определить местоположение. Выйдите ближе к окну и повторите.',
  mocked_location: 'Обнаружена подмена геолокации. Отметка заблокирована.',
  device_not_bound: 'Устройство не привязано к аккаунту. Обратитесь к HR.',
  device_mismatch: 'Аккаунт привязан к другому устройству. Отметка возможна только с него.',
  already_checked_in: 'Приход на сегодня уже отмечен.',
  outside_schedule: 'Отметка вне разрешённого интервала рабочего графика.',
  employee_inactive: 'Учётная запись неактивна.',
};

export const ATTENDANCE_STATUSES = ['ON_TIME', 'LATE', 'ABSENT', 'DAY_OFF', 'EXCUSED'] as const;
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
