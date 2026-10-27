import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLoadCache, useLoad } from '../src/useLoad';

beforeEach(() => clearLoadCache());

describe('загрузка данных экрана', () => {
  it('повторное открытие сразу показывает прошлые данные', async () => {
    const first = renderHook(() => useLoad(() => Promise.resolve(['смена']), 'табель'));
    await waitFor(() => expect(first.result.current.data).toEqual(['смена']));
    first.unmount();

    // Вкладку открыли снова: данные есть до ответа сервера.
    let resolve!: (value: string[]) => void;
    const second = renderHook(() =>
      useLoad(() => new Promise<string[]>((done) => (resolve = done)), 'табель'),
    );

    expect(second.result.current.data).toEqual(['смена']);
    expect(second.result.current.loading).toBe(true);

    await act(async () => resolve(['смена', 'новая смена']));
    expect(second.result.current.data).toEqual(['смена', 'новая смена']);
  });

  it('после выхода кеш пуст — чужие цифры не видны', async () => {
    const first = renderHook(() => useLoad(() => Promise.resolve(250_000), 'зарплата'));
    await waitFor(() => expect(first.result.current.data).toBe(250_000));
    first.unmount();

    clearLoadCache();

    const second = renderHook(() => useLoad(() => new Promise<number>(() => {}), 'зарплата'));
    expect(second.result.current.data).toBeNull();
  });

  it('ошибка не стирает уже показанные данные', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('табель')
      .mockRejectedValueOnce(new Error('Нет связи'));
    const { result } = renderHook(() => useLoad(load));

    await waitFor(() => expect(result.current.data).toBe('табель'));
    act(() => result.current.reload());

    await waitFor(() => expect(result.current.error).toBe('Нет связи'));
    expect(result.current.data).toBe('табель');
  });
});
