import { mapKcellHistory } from '../src/calls/kcell-history';

/**
 * Строки — по образцу ответа живого кабинета Kcell из тестов мониторинга
 * операторов, номера обезличены.
 */
const OUT_SUCCESS = {
  start: '2026-08-10T10:54:42Z', uid: 'UID-SUCCESS-1', type: 'out', status: 'success',
  client: '77000000001', diversion: '77780030234', user: 'aisha', user_name: 'Асель', wait: 9, duration: 22,
};
// У недозвона ключа duration нет вообще — не 0, а отсутствует.
const OUT_NOANSWER = {
  start: '2026-08-10T10:55:41Z', uid: 'UID-NOANSWER-1', type: 'out', status: 'noanswer',
  client: '77000000002', diversion: '77780030234', user: 'aisha', user_name: 'Асель', wait: 6,
};
// Пропущенный на отдел: нет ключей user и user_name.
const IN_MISSED_DEPARTMENT = {
  start: '2026-08-10T10:49:55Z', uid: 'UID-MISSED-1', type: 'in', status: 'missed',
  client: '77000000003', destination: 'vm', group_name: 'Отдел продаж', diversion: '77780030234', wait: 6,
};
const IN_SUCCESS = {
  start: '2026-08-10T09:00:00Z', uid: 'UID-IN-SUCCESS-1', type: 'in', status: 'success',
  client: '77000000004', user: 'dina', user_name: 'Дина', diversion: '77780030234', wait: 5, duration: 40,
};

describe('история звонков Kcell', () => {
  it('состоявшийся исходящий — разговор и ожидание', () => {
    const { calls } = mapKcellHistory([OUT_SUCCESS]);

    expect(calls).toEqual([
      {
        employeeKey: 'aisha',
        clientPhone: '77000000001',
        direction: 'OUTBOUND',
        startedAt: new Date('2026-08-10T10:54:42Z'),
        durationSeconds: 31,
        talkSeconds: 22,
        externalId: 'UID-SUCCESS-1',
      },
    ]);
  });

  it('недозвон без ключа duration — ноль разговора, а не ошибка', () => {
    const { calls } = mapKcellHistory([OUT_NOANSWER]);

    expect(calls[0]).toMatchObject({ talkSeconds: 0, direction: 'OUTBOUND' });
  });

  it('пропущенный на отдел ни на кого не кладётся', () => {
    const result = mapKcellHistory([IN_MISSED_DEPARTMENT]);

    expect(result.calls).toHaveLength(0);
    expect(result.withoutEmployee).toBe(1);
  });

  it('входящий отвеченный — с разговором', () => {
    const { calls } = mapKcellHistory([IN_SUCCESS]);

    expect(calls[0]).toMatchObject({ employeeKey: 'dina', direction: 'INBOUND', talkSeconds: 40 });
  });

  it('внутренний звонок между сотрудниками не считается', () => {
    const result = mapKcellHistory([{ ...OUT_SUCCESS, uid: 'UID-INT', type: 'internal' }]);

    expect(result.calls).toHaveLength(0);
    expect(result.internal).toBe(1);
  });

  it('дубль по uid снимается', () => {
    // Пагинации у history/json нет, и повтор в ответе документацией не исключён.
    expect(mapKcellHistory([OUT_SUCCESS, OUT_SUCCESS]).calls).toHaveLength(1);
  });

  it('новый статус Kcell — недозвон, но звонок не теряется', () => {
    const { calls } = mapKcellHistory([{ ...OUT_SUCCESS, uid: 'UID-NEW', status: 'some_new_status' }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].talkSeconds).toBe(0);
  });

  it('строка без времени или uid не ломает разбор', () => {
    const result = mapKcellHistory([{ ...OUT_SUCCESS, uid: undefined }, { ...OUT_SUCCESS, uid: 'X', start: 'вчера' }]);

    expect(result.invalid).toBe(2);
  });

  it('не массив — пустой результат', () => {
    // На обёртку {items: [...]} не полагаемся, но и падать на ней нельзя.
    expect(mapKcellHistory({ items: [] }).calls).toEqual([]);
  });
});
