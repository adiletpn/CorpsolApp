import { encodeQrPayload, encodeStartCode, extractStartParam, parseCheckInCode } from '@corpsol/shared';

const printed = { v: 1 as const, t: 'sJ6jXi8CaJk31Bd3zQhH', c: 3, s: 'WHcG-H4OHy_zRdb6', p: 1 as const };

describe('код отметки в любом виде', () => {
  it('ссылка t.me с листка — её открывает обычная камера', () => {
    const link = `https://t.me/corpsol_bot?startapp=${encodeStartCode(printed)}`;

    expect(parseCheckInCode(link)).toEqual(printed);
  });

  it('сам параметр запуска — его получает мини-апп, открытый камерой', () => {
    expect(parseCheckInCode('q3-sJ6jXi8CaJk31Bd3zQhH-WHcG-H4OHy_zRdb6')).toEqual(printed);
  });

  it('подпись с дефисом не путается с разделителями', () => {
    expect(parseCheckInCode(encodeStartCode({ ...printed, s: 'a-b-c-d-e-f-g-hh' }))?.s).toBe('a-b-c-d-e-f-g-hh');
  });

  it('дефис в имени терминала тоже не мешает', () => {
    expect(parseCheckInCode(encodeStartCode({ ...printed, t: 'term-1' }))?.t).toBe('term-1');
  });

  it('живой код экрана в JSON по-прежнему читается', () => {
    const live = { v: 1 as const, t: 'term-1', c: 58_000_000, s: 'abcdefghij' };
    expect(parseCheckInCode(encodeQrPayload(live))).toEqual(live);
  });

  it('чужая ссылка и мусор — не код', () => {
    expect(parseCheckInCode('https://t.me/other_bot?startapp=promo2026')).toBeNull();
    expect(parseCheckInCode('https://example.com')).toBeNull();
    expect(parseCheckInCode('{не json')).toBeNull();
  });

  it('параметр startapp достаётся из ссылки с другими параметрами', () => {
    expect(extractStartParam('https://t.me/bot/app?mode=compact&startapp=q1-t-abcdefgh')).toBe('q1-t-abcdefgh');
    expect(extractStartParam('https://t.me/bot')).toBeNull();
  });
});
