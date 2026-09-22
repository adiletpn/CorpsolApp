import { auth, currentIdToken } from '../lib/firebase';
import { getDeviceDescriptor } from '../lib/device';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Ошибка API с машинным кодом — экран решает по коду, что показать. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

async function parseError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({}));
  const body = (payload?.message ?? payload) as Record<string, unknown>;

  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message =
    typeof body?.message === 'string' ? body.message : 'Не удалось выполнить запрос';

  return new ApiError(response.status, code, message, body ?? {});
}

/**
 * Заголовки устройства уходят с каждым запросом, а не только при входе:
 * Firebase Auth разрешает вход с любого числа устройств, поэтому запрет
 * «один аккаунт — один телефон» держится на серверной проверке этих значений.
 */
async function deviceHeaders(): Promise<Record<string, string>> {
  const device = await getDeviceDescriptor();

  const headers: Record<string, string> = {
    'x-device-id': device.deviceId,
    'x-device-platform': device.platform,
  };
  if (device.model) headers['x-device-model'] = device.model;
  if (device.osVersion) headers['x-device-os'] = device.osVersion;
  if (device.appVersion) headers['x-app-version'] = device.appVersion;

  return headers;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth: needsAuth = true } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (needsAuth) {
    const token = await currentIdToken();
    if (!token) throw new ApiError(401, 'no_session', 'Сессия не найдена, войдите заново');

    headers.Authorization = `Bearer ${token}`;
    Object.assign(headers, await deviceHeaders());
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Firebase сам обновляет токен заранее, поэтому 401 означает отзыв доступа:
  // сотрудника уволили либо устройство открепили. Повтор запроса не поможет.
  if (response.status === 401 && needsAuth) {
    await auth.signOut().catch(() => undefined);
    throw await parseError(response);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
