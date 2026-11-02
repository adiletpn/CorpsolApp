import { mapBitrixDeals, toMinor, type BitrixDeal } from '../src/offers/bitrix-deals';

const deal = (fields: Partial<BitrixDeal> = {}): BitrixDeal => ({
  ID: '101',
  TITLE: 'ТОО «Алтын Дала»',
  OPPORTUNITY: '145000.00',
  CURRENCY_ID: 'KZT',
  STAGE_ID: 'WON',
  STAGE_SEMANTIC_ID: 'S',
  ASSIGNED_BY_ID: '12',
  DATE_CREATE: '2026-10-03T10:00:00+05:00',
  CLOSEDATE: '2026-10-15T18:00:00+05:00',
  DATE_MODIFY: '2026-10-15T18:05:00+05:00',
  ...fields,
});

describe('сделки Bitrix24 в регистрации', () => {
  it('успешная сделка — принятая регистрация в день закрытия', () => {
    const [mapped] = mapBitrixDeals([deal()]).deals;

    expect(mapped).toMatchObject({
      externalId: '101',
      employeeKey: '12',
      clientName: 'ТОО «Алтын Дала»',
      amountMinor: 14_500_000,
      status: 'ACCEPTED',
      sentDate: '2026-10-15',
    });
    expect(mapped.resolvedAt?.toISOString()).toBe('2026-10-15T13:00:00.000Z');
  });

  it('статус — по смыслу стадии, а не по её названию', () => {
    const { deals } = mapBitrixDeals([
      deal({ ID: '1', STAGE_ID: 'C3:WON', STAGE_SEMANTIC_ID: 'S' }),
      deal({ ID: '2', STAGE_ID: 'LOSE', STAGE_SEMANTIC_ID: 'F' }),
      deal({ ID: '3', STAGE_ID: 'C3:PREPARATION', STAGE_SEMANTIC_ID: 'P' }),
    ]);

    expect(deals.map((item) => item.status)).toEqual(['ACCEPTED', 'REJECTED', 'SENT']);
  });

  it('у открытой сделки дата закрытия — план, а не факт: её день — день создания', () => {
    const [mapped] = mapBitrixDeals([deal({ STAGE_SEMANTIC_ID: 'P', CLOSEDATE: '2026-12-31T00:00:00+05:00' })]).deals;

    expect(mapped.sentDate).toBe('2026-10-03');
    expect(mapped.resolvedAt).toBeNull();
  });

  it('день считается по Алматы: закрыта в 01:00 местного — это уже следующий день', () => {
    const [mapped] = mapBitrixDeals([deal({ CLOSEDATE: '2026-10-15T20:30:00Z' })]).deals;

    expect(mapped.sentDate).toBe('2026-10-16');
  });

  it('успешная без даты закрытия — по дате изменения', () => {
    const [mapped] = mapBitrixDeals([deal({ CLOSEDATE: null, DATE_MODIFY: '2026-10-20T12:00:00+05:00' })]).deals;

    expect(mapped.sentDate).toBe('2026-10-20');
  });

  it('без ответственного или даты создания — не разложить, сделка отмечается', () => {
    const result = mapBitrixDeals([deal({ ID: '7', ASSIGNED_BY_ID: '' }), deal({ ID: '8', DATE_CREATE: 'вчера' })]);

    expect(result.deals).toEqual([]);
    expect(result.rejected).toEqual(['7', '8']);
  });

  it('без названия — понятная подпись с номером', () => {
    expect(mapBitrixDeals([deal({ TITLE: '  ' })]).deals[0].clientName).toBe('Сделка №101');
  });

  it('сумма — в тиынах без ошибок округления', () => {
    expect(toMinor('145000.00')).toBe(14_500_000);
    expect(toMinor('0.1')).toBe(10);
    expect(toMinor('99.99')).toBe(9_999);
    expect(toMinor('1999,5')).toBe(199_950);
    expect(toMinor(null)).toBe(0);
    expect(toMinor('нет')).toBe(0);
  });
});
