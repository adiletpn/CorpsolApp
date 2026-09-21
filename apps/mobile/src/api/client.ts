import { clearTokens, loadTokens, saveTokens, type TokenPair } from '../lib/storage';

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

let refreshInFlight: Promise<TokenPair | null> | null = null;

async function parseError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({}));
  const body = (payload?.message ?? payload) as Record<string, unknown>;

  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message =
    typeof body?.message === 'string' ? body.message : 'Не удалось выполнить запрос';

  return new ApiError(response.status, code, message, body ?? {});
}

/** Обновление токенов выполняется один раз, даже если 401 прилетел из нескольких запросов сразу. */
async function refreshTokens(): Promise<TokenPair | null> {
  refreshInFlight ??= (async () => {
    try {
      const tokens = await loadTokens();
      if (!tokens) return null;

      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!response.ok) {
        await clearTokens();
        return null;
      }

      const data = (await response.json()) as TokenPair;
      await saveTokens(data);
      return data;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const send = async (accessToken?: string): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let tokens = auth ? await loadTokens() : null;
  let response = await send(tokens?.accessToken);

  // Access-токен живёт 15 минут — молча обновляем его и повторяем запрос один раз.
  if (response.status === 401 && auth) {
    tokens = await refreshTokens();
    if (!tokens) throw await parseError(response);
    response = await send(tokens.accessToken);
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
