import { useCallback, useEffect, useState } from 'react';

interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload(): void;
}

/**
 * Последние данные каждого экрана. Вкладку открывают по многу раз за день:
 * с кешем она показывается сразу, а свежие данные подменяют старые тихо.
 * Живёт до закрытия мини-аппа — дольше держать табель незачем.
 */
const cache = new Map<string, unknown>();

/** Сброс при выходе: следующий вошедший не должен увидеть чужие цифры. */
export function clearLoadCache(): void {
  cache.clear();
}

/** Загрузка данных экрана с повтором — без неё каждый экран повторял бы одно и то же. */
export function useLoad<T>(load: () => Promise<T>, cacheKey?: string): Loaded<T> {
  const [data, setData] = useState<T | null>(() =>
    cacheKey && cache.has(cacheKey) ? (cache.get(cacheKey) as T) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    load()
      .then((value) => {
        if (cancelled) return;
        if (cacheKey) cache.set(cacheKey, value);
        setData(value);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Загрузчик пересоздаётся на каждой отрисовке — перезапуск только по повтору.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, error, loading, reload };
}
