import { parseCallDate, parseKcellExport } from '../src/calls/kcell-parser';

describe('разбор даты из выгрузки', () => {
  // Ожидания — точным моментом в UTC: «часы машины» в CI и на Mac разные.
  it('понимает формат «25.09.2026 14:30:05»', () => {
    expect(parseCallDate('25.09.2026 14:30:05')?.toISOString()).toBe('2026-09-25T09:30:05.000Z');
  });

  it('не путает день с месяцем', () => {
    // 05.09 — это пятое сентября, а не девятое мая.
    expect(parseCallDate('05.09.2026 10:00')?.toISOString()).toBe('2026-09-05T05:00:00.000Z');
  });

  it('понимает ISO', () => {
    expect(parseCallDate('2026-09-25T14:30:05Z')).not.toBeNull();
  });

  it('на мусоре возвращает null, а не Invalid Date', () => {
    expect(parseCallDate('не дата')).toBeNull();
    expect(parseCallDate('')).toBeNull();
  });
});

describe('разбор выгрузки Kcell', () => {
  it('находит столбцы по названию, а не по позиции', () => {
    // Столбцы намеренно в непривычном порядке.
    const csv = [
      'Длительность;Номер Б;Дата и время;Номер абонента;Направление',
      '00:01:23;+7 707 111-22-33;25.09.2026 09:15:00;87012345678;Исходящий',
    ].join('\n');

    const { calls, rejected } = parseKcellExport(csv);

    expect(rejected).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].employeeKey).toBe('+77012345678');
    expect(calls[0].clientPhone).toBe('+77071112233');
    expect(calls[0].durationSeconds).toBe(83);
    expect(calls[0].direction).toBe('OUTBOUND');
  });

  it('понимает запятую как разделитель', () => {
    const csv = [
      'Номер абонента,Номер Б,Дата и время,Длительность',
      '87012345678,87071112233,25.09.2026 09:15:00,95',
    ].join('\n');

    expect(parseKcellExport(csv).calls).toHaveLength(1);
  });

  it('понимает английские заголовки', () => {
    const csv = [
      'MSISDN;B-number;Date;Duration;Direction',
      '87012345678;87071112233;2026-09-25T09:15:00Z;60;Incoming',
    ].join('\n');

    const { calls } = parseKcellExport(csv);

    expect(calls).toHaveLength(1);
    expect(calls[0].direction).toBe('INBOUND');
  });

  it('не роняет разбор из-за одной плохой строки', () => {
    const csv = [
      'Номер абонента;Номер Б;Дата и время;Длительность',
      '87012345678;87071112233;25.09.2026 09:15:00;60',
      'мусор;тоже мусор;непонятно;что',
      '87012345678;87071112244;25.09.2026 10:15:00;90',
    ].join('\n');

    const { calls, rejected } = parseKcellExport(csv);

    // Две хорошие строки импортированы, плохая отложена с причиной.
    expect(calls).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].line).toBe(3);
    expect(rejected[0].reason).toContain('номер');
  });

  it('даёт одинаковые ключи при повторном импорте того же файла', () => {
    const csv = [
      'Номер абонента;Номер Б;Дата и время;Длительность',
      '87012345678;87071112233;25.09.2026 09:15:00;60',
    ].join('\n');

    const first = parseKcellExport(csv).calls[0].externalId;
    const second = parseKcellExport(csv).calls[0].externalId;

    // На этом держится защита от дублей при повторной загрузке.
    expect(first).toBe(second);
  });

  it('сообщает, если в заголовке нет нужных столбцов', () => {
    const csv = ['Что-то;Совсем;Другое', 'a;b;c'].join('\n');

    const { calls, rejected } = parseKcellExport(csv);

    expect(calls).toHaveLength(0);
    expect(rejected[0].reason).toContain('не найдены столбцы');
  });

  it('обрабатывает кавычки внутри полей', () => {
    const csv = [
      'Номер абонента;Номер Б;Дата и время;Длительность',
      '"87012345678";"8 707 111-22-33";"25.09.2026 09:15:00";"60"',
    ].join('\n');

    expect(parseKcellExport(csv).calls).toHaveLength(1);
  });

  it('не падает на пустом файле', () => {
    expect(parseKcellExport('').calls).toHaveLength(0);
    expect(parseKcellExport('только заголовок').calls).toHaveLength(0);
  });
});

describe('время звонка — по Алматы, где бы ни работал сервер', () => {
  it('«25.09.2026 14:30» — это 09:30 UTC', () => {
    // Выгрузка пишет местное время. На Railway сервер работает в UTC,
    // и разбор «как местное время сервера» сдвигал звонки на 5 часов.
    expect(parseCallDate('25.09.2026 14:30:05')?.toISOString()).toBe('2026-09-25T09:30:05.000Z');
  });

  it('ISO с поясом разбирается как есть', () => {
    expect(parseCallDate('2026-09-25T09:30:05Z')?.toISOString()).toBe('2026-09-25T09:30:05.000Z');
  });
});
