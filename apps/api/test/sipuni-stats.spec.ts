import { mapSipuniExport } from '../src/calls/sipuni-stats';

/** Заголовок — как в настоящей выгрузке Sipuni, с BOM в начале. */
const HEADER =
  '﻿Тип;Статус;Время;Схема;Откуда;Куда;Кто ответил;Длительность звонка, сек;Длительность разговора, сек;Время ответа, сек;Оценка;ID записи';

const row = (cells: string[]) => cells.join(';');

const csv = (...rows: string[]) => [HEADER, ...rows].join('\r\n');

describe('статистика Sipuni', () => {
  it('исходящий с разговором — на сотрудника по номеру в схеме', () => {
    const { calls } = mapSipuniExport(
      csv(row(['Исходящий', 'Отвечен', '29.12.2025 17:49:40', 'исход +7707 nom 236', '236', '+77070000001', '', '75', '61', '14', '', '1283678'])),
      ['236'],
    );

    expect(calls).toEqual([
      {
        employeeKey: '236',
        clientPhone: '+77070000001',
        direction: 'OUTBOUND',
        // Время в выгрузке — по Алматы.
        startedAt: new Date('2025-12-29T12:49:40Z'),
        durationSeconds: 75,
        talkSeconds: 61,
        externalId: '29.12.2025 17:49:40|236|+77070000001|1283678',
      },
    ]);
  });

  it('входящий: клиент — «Откуда», сотрудник — в схеме', () => {
    const { calls } = mapSipuniExport(
      csv(row(['Входящий', 'Не отвечен', '29.12.2025 17:49:39', 'Входящая 7475567651 Балнур 97', '+77000000003', '+77475567651', '', '1', '', '', '', ''])),
      ['97', '236'],
    );

    expect(calls[0]).toMatchObject({ employeeKey: '97', direction: 'INBOUND', clientPhone: '+77000000003', talkSeconds: 0 });
  });

  it('номер ищется отдельным числом: «94» не совпадает внутри «1940»', () => {
    const result = mapSipuniExport(
      csv(row(['Исходящий', 'Отвечен', '29.12.2025 10:00:00', 'исход кампания 1940', '1', '+77070000001', '', '10', '5', '', '', ''])),
      ['94'],
    );

    expect(result.calls).toHaveLength(0);
    expect(result.withoutEmployee).toBe(1);
  });

  it('длинный номер не перехватывается коротким', () => {
    const { calls } = mapSipuniExport(
      csv(row(['Исходящий', 'Отвечен', '29.12.2025 10:00:00', 'исход nom 236', '1', '+77070000001', '', '10', '5', '', '', ''])),
      ['23', '236'],
    );

    expect(calls[0].employeeKey).toBe('236');
  });

  it('сотрудник находится и по «Кто ответил»', () => {
    const { calls } = mapSipuniExport(
      csv(row(['Входящий', 'Отвечен', '29.12.2025 10:00:00', 'Входящая линия', '+77000000003', '+77475567651', 'Мария 240', '30', '25', '', '', ''])),
      ['240'],
    );

    expect(calls[0].employeeKey).toBe('240');
  });

  it('пустая или кривая выгрузка не ломает разбор', () => {
    expect(mapSipuniExport('', ['236']).calls).toEqual([]);
    expect(mapSipuniExport(csv(row(['Исходящий', 'Отвечен', 'вчера', 'nom 236'])), ['236']).invalid).toBe(1);
  });
});
