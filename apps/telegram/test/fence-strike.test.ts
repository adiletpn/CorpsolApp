import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

const { fenceStrikeHint, formatDistance } = await import('../src/screens/Home');

describe('попытка отметиться не из офиса', () => {
  it('первый и второй день — предупреждение, сколько осталось до выговора', () => {
    expect(fenceStrikeHint({ fenceDays: 1, reprimanded: false })).toBe(
      'Попытка записана: 1-й день из 3 в этом месяце. На третий — выговор.',
    );
    expect(fenceStrikeHint({ fenceDays: 2, reprimanded: false })).toContain('2-й день из 3');
  });

  it('третий день — выговор, руководитель уведомлён', () => {
    expect(fenceStrikeHint({ fenceDays: 3, reprimanded: true })).toContain('выговор, руководитель уведомлён');
  });

  it('дальше третьего дня — тоже под выговором, без «из 3»', () => {
    const hint = fenceStrikeHint({ fenceDays: 5, reprimanded: false });
    expect(hint).toContain('5-й день');
    expect(hint).not.toContain('из 3');
  });

  it('расстояние до офиса — первым, чтобы отказ не выглядел сбоем', () => {
    expect(fenceStrikeHint({ distanceMeters: 2400, fenceDays: 1, reprimanded: false })).toBe(
      'До офиса 2,4 км. Попытка записана: 1-й день из 3 в этом месяце. На третий — выговор.',
    );
  });

  it('без счётчика — только расстояние', () => {
    expect(fenceStrikeHint({ distanceMeters: 850 })).toBe('До офиса 850 м.');
    expect(fenceStrikeHint({})).toBeUndefined();
  });

  it('метры и километры', () => {
    expect(formatDistance(140.6)).toBe('141 м');
    expect(formatDistance(1050)).toBe('1,1 км');
  });
});
