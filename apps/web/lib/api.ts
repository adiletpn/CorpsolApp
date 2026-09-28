'use client';

import { auth, currentIdToken } from './firebase';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Ошибка API с машинным кодом — экран решает по коду, что показать. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
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

  return new ApiError(
    response.status,
    typeof body?.code === 'string' ? body.code : undefined,
    typeof body?.message === 'string' ? body.message : 'Не удалось выполнить запрос',
  );
}

/**
 * Запрос к бэкенду от имени вошедшего пользователя.
 *
 * Заголовки устройства панель не шлёт намеренно: привязка к телефону
 * действует только для менеджеров, а руководители заходят с любого браузера.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth: needsAuth = true } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (needsAuth) {
    const token = await currentIdToken();
    if (!token) throw new ApiError(401, 'no_session', 'Сессия не найдена, войдите заново');
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  // Firebase обновляет токен заранее, поэтому 401 означает отзыв доступа:
  // сотрудника уволили либо права изменились. Повтор не поможет.
  if (response.status === 401 && needsAuth) {
    await auth.signOut().catch(() => undefined);
    throw await parseError(response);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/** Собирает строку запроса, пропуская пустые значения. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }

  const result = search.toString();
  return result ? `?${result}` : '';
}
