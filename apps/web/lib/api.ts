'use client';

import { currentIdToken, getAuthClient } from './firebase';

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
    await getAuthClient().signOut().catch(() => undefined);
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

/**
 * Скачивание файла из API.
 *
 * Простой ссылкой это не сделать: маршрут требует токен в заголовке,
 * а <a href> его не отправит. Поэтому файл забирается запросом и
 * отдаётся браузеру уже из памяти.
 */
export async function download(path: string, fallbackName: string): Promise<void> {
  const token = await currentIdToken();
  if (!token) throw new ApiError(401, 'no_session', 'Сессия не найдена, войдите заново');

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) throw await parseError(response);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(response) ?? fallbackName;
  link.click();

  // Ссылка на объект держит файл в памяти, пока её не освободить, но
  // освобождать сразу после клика нельзя: Safari и Firefox успевают
  // отменить начатое скачивание. Отпускаем следующим тиком, когда
  // браузер уже забрал содержимое.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Имя файла, которое предложил сервер. */
function filenameFrom(response: Response): string | null {
  const header = response.headers.get('Content-Disposition');
  if (!header) return null;

  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}
