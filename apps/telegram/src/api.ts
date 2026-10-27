import type {
  AttendanceStatus,
  PlanMetric,
  PlanScope,
  Role,
} from '@corpsol/shared';

import { auth } from './firebase';
import { devicePlatform, initData, telegramVersion } from './telegram';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

/** Ошибка API с машинным кодом — экран решает по коду, что показать. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/**
 * Строка запуска Telegram уходит с каждым запросом: Firebase пускает в
 * аккаунт откуда угодно, и запрет «один аккаунт — один Telegram» держится
 * только на серверной проверке её подписи.
 */
function telegramHeaders(): Record<string, string> {
  const launch = initData();
  const version = telegramVersion();
  return {
    ...(launch ? { 'x-telegram-init-data': launch } : {}),
    'x-device-platform': devicePlatform(),
    ...(version ? { 'x-app-version': `Telegram ${version}` } : {}),
  };
}

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();

  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...telegramHeaders(),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  const json = text ? safeParse(text) : null;

  if (!response.ok) throw toError(response.status, json);
  return json as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Отказы входа сервер отдаёт кодом без текста — клиент сам говорит
 * человеку, что случилось и что делать. Без этого он видел бы
 * «Не удалось выполнить запрос» и не понимал, почему его не пускают.
 */
const CODE_MESSAGES: Record<string, string> = {
  device_mismatch:
    'Аккаунт закреплён за другим Telegram. Заявка на смену отправлена руководителю — после одобрения войдите снова.',
  device_taken: 'Этот Telegram уже закреплён за другим сотрудником.',
  device_required: 'Откройте приложение через бота в Telegram.',
  telegram_invalid: 'Не удалось подтвердить аккаунт Telegram. Закройте приложение и откройте заново.',
  telegram_not_configured: 'Вход через Telegram ещё не настроен. Сообщите администратору.',
  employee_inactive: 'Учётная запись неактивна. Обратитесь к руководителю.',
};

/** Nest кладёт наш объект ошибки в поле message — разворачиваем его. */
export function toError(status: number, json: unknown): ApiError {
  let body: Record<string, unknown> = {};
  if (json && typeof json === 'object') {
    const nested = (json as Record<string, unknown>).message;
    body =
      nested && typeof nested === 'object'
        ? (nested as Record<string, unknown>)
        : (json as Record<string, unknown>);
  }

  const code = typeof body.code === 'string' ? body.code : null;

  let message = 'Не удалось выполнить запрос';
  if (typeof body.message === 'string') message = body.message;
  else if (code && CODE_MESSAGES[code]) message = CODE_MESSAGES[code];
  else if (status >= 500) message = 'Сервер временно недоступен. Попробуйте позже.';

  return new ApiError(
    status,
    code,
    message,
    (body.details as Record<string, unknown>) ?? {},
  );
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
}

export interface CheckInResult {
  status: AttendanceStatus;
  lateMinutes: number;
  checkInAt: string;
  office: { id: string; name: string };
}

export interface AttendanceRecord {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
  method: 'QR' | 'MANUAL_ADJUSTMENT' | 'AUTO_ABSENCE';
}

export interface CallsSummary {
  total: number;
  answered: number;
  talkMinutes: number;
  outbound: number;
  outboundAnswered: number;
}

export interface Call {
  id: string;
  clientPhone: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED';
  callDate: string;
  startedAt: string;
  talkSeconds: number;
}

export interface Plan {
  id: string;
  scope: PlanScope;
  progress: {
    metric: PlanMetric;
    target: number;
    achieved: number;
    ratio: number;
    remaining: number;
    isComplete: boolean;
  };
}

export interface Payroll {
  id: string;
  periodStart: string;
  periodEnd: string;
  baseSalaryMinor: number;
  bonusMinor: number;
  penaltyMinor: number;
  totalMinor: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  lines: Array<{ ruleId: string; kind: string; title: string; amountMinor: number }>;
}

export interface Offer {
  id: string;
  clientName: string;
  amountMinor: number;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  sentDate: string;
}

export interface RankedEntry {
  userId: string;
  fullName: string;
  points: number;
  rank: number;
  pointsBehindLeader: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  points: number;
  unlockedAt: string | null;
}

export const api = {
  /** Первый запрос после входа: закрепляет аккаунт за Telegram. */
  openSession: () => request<AuthUser>('/auth/session', { method: 'POST', body: {} }),
  closeSession: () => request<void>('/auth/logout', { method: 'POST' }),

  checkIn: (body: { qr: string; lat: number; lng: number; accuracyMeters: number }) =>
    request<CheckInResult>('/attendance/check-in', {
      method: 'POST',
      // Флага подмены геолокации WebView не даёт — честно сообщаем «нет данных».
      body: { ...body, isMocked: false, capturedAt: new Date().toISOString() },
    }),
  checkOut: () =>
    request<{ checkOutAt: string }>('/attendance/check-out', {
      method: 'POST',
      body: { capturedAt: new Date().toISOString() },
    }),

  attendance: (from: string, to: string) =>
    request<AttendanceRecord[]>(`/attendance/me?from=${from}&to=${to}`),
  /** Журнал звонков отдаётся страницами — берём первую, свежие сверху. */
  calls: (from: string, to: string) =>
    request<{ items: Call[]; nextBefore: string | null }>(`/calls?from=${from}&to=${to}&limit=40`),
  callsSummary: (from: string, to: string) =>
    request<CallsSummary>(`/calls/summary?from=${from}&to=${to}`),
  plans: (periodStart: string) => request<Plan[]>(`/plans?periodStart=${periodStart}`),
  payroll: (periodStart: string) => request<Payroll[]>(`/payroll?periodStart=${periodStart}`),
  offers: (from: string, to: string) => request<Offer[]>(`/offers?from=${from}&to=${to}`),
  leaderboard: (from: string, to: string) =>
    request<{ entries: RankedEntry[]; self: RankedEntry | null }>(
      `/gamification/leaderboard?from=${from}&to=${to}`,
    ),
  achievements: () => request<Achievement[]>('/gamification/achievements'),
};
