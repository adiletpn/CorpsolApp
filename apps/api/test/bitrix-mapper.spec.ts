import { mapBitrixCalls, parseBitrixDate, type BitrixCallRecord } from '../src/calls/bitrix-mapper';

const record = (overrides: Partial<BitrixCallRecord> = {}): BitrixCallRecord => ({
  ID: '1001',
  CALL_ID: 'ext.call.1001',
  PORTAL_USER_ID: '17',
  PHONE_NUMBER: '+7 707 111-22-33',
  CALL_TYPE: '1',
  CALL_DURATION: '83',
  CALL_START_DATE: '2026-09-25T09:15:00+05:00',
  CALL_FAILED_CODE: '200',
  ...overrides,
});

describe('разбор даты Bitrix', () => {
  it('понимает дату с часовым поясом', () => {
    expect(parseBitrixDate('2026-09-25T09:15:00+05:00')).not.toBeNull();
  });

  it('понимает дату без часового пояса', () => {
    const date = parseBitrixDate('2026-09-25 09:15:00');

    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
  });

  it('на пустом и мусорном значении возвращает null', () => {
    expect(parseBitrixDate('')).toBeNull();
    expect(parseBitrixDate(undefined)).toBeNull();
    expect(parseBitrixDate('не дата')).toBeNull();
  });
});

describe('преобразование звонков Bitrix', () => {
  it('сопоставляет сотрудника по идентификатору портала, а не по телефону', () => {
    const { calls } = mapBitrixCalls([record()]);

    expect(calls).toHaveLength(1);
    // В Bitrix звонок привязан к пользователю, а не к номеру.
    expect(calls[0].employeeKey).toBe('17');
    expect(calls[0].clientPhone).toBe('+77071112233');
  });

  it('различает входящие и исходящие, включая переадресованные', () => {
    const { calls } = mapBitrixCalls([
      record({ CALL_TYPE: '1', CALL_ID: 'a' }),
      record({ CALL_TYPE: '2', CALL_ID: 'b' }),
      record({ CALL_TYPE: '4', CALL_ID: 'c' }),
    ]);

    expect(calls.map((call) => call.direction)).toEqual(['OUTBOUND', 'INBOUND', 'INBOUND']);
  });

  it('не засчитывает гудки неотвеченного звонка как разговор', () => {
    // Звонок длился 30 секунд, но трубку не подняли.
    const { calls } = mapBitrixCalls([
      record({ CALL_FAILED_CODE: '486', CALL_DURATION: '30' }),
    ]);

    expect(calls[0].durationSeconds).toBe(30);
    // В план такие минуты идти не должны.
    expect(calls[0].talkSeconds).toBe(0);
  });

  it('берёт идентификатор звонка у портала', () => {
    const { calls } = mapBitrixCalls([record()]);

    // Свой ключ собирать не нужно — у Bitrix он уже есть и устойчив.
    expect(calls[0].externalId).toBe('ext.call.1001');
  });

  it('откатывается на числовой ID, если CALL_ID отсутствует', () => {
    const { calls } = mapBitrixCalls([record({ CALL_ID: undefined })]);

    expect(calls[0].externalId).toBe('1001');
  });

  it('принимает поля, пришедшие числами, а не строками', () => {
    const { calls, rejected } = mapBitrixCalls([
      record({ PORTAL_USER_ID: 17, CALL_TYPE: 2, CALL_DURATION: 60, CALL_FAILED_CODE: 200 }),
    ]);

    expect(rejected).toHaveLength(0);
    expect(calls[0].employeeKey).toBe('17');
    expect(calls[0].direction).toBe('INBOUND');
    expect(calls[0].talkSeconds).toBe(60);
  });
});

describe('записи, которые нельзя импортировать', () => {
  it('откладывает звонок без сотрудника портала', () => {
    const { calls, rejected } = mapBitrixCalls([record({ PORTAL_USER_ID: '' })]);

    expect(calls).toHaveLength(0);
    expect(rejected[0].reason).toContain('не привязан');
  });

  it('откладывает звонок с нераспознанным номером клиента', () => {
    const { rejected } = mapBitrixCalls([record({ PHONE_NUMBER: '123' })]);

    expect(rejected[0].reason).toContain('номер клиента');
  });

  it('откладывает звонок без идентификатора', () => {
    const { rejected } = mapBitrixCalls([record({ ID: undefined, CALL_ID: undefined })]);

    expect(rejected[0].reason).toContain('идентификатора');
  });

  it('одна плохая запись не мешает остальным', () => {
    const { calls, rejected } = mapBitrixCalls([
      record({ CALL_ID: 'ok-1' }),
      record({ CALL_ID: 'bad', PHONE_NUMBER: 'мусор' }),
      record({ CALL_ID: 'ok-2' }),
    ]);

    expect(calls).toHaveLength(2);
    expect(rejected).toHaveLength(1);
  });

  it('не падает на пустом ответе', () => {
    expect(mapBitrixCalls([])).toEqual({ calls: [], rejected: [] });
  });
});
