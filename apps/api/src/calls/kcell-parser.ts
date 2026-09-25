import { normalizePhone, parseDurationSeconds } from '@corpsol/shared';

/**
 * Разбор детализации Kcell.
 *
 * Кабинет оператора отдаёт CSV без устойчивой схемы: порядок столбцов
 * меняется между выгрузками, заголовки бывают на русском и английском,
 * разделителем встречается и запятая, и точка с запятой. Поэтому столбцы
 * ищем по названию, а не по позиции — иначе очередная выгрузка молча
 * разложилась бы не по тем полям.
 */

export interface ParsedCall {
  /** Рабочий номер сотрудника — по нему звонок сопоставляется с человеком. */
  employeePhone: string;
  clientPhone: string;
  direction: 'INBOUND' | 'OUTBOUND';
  startedAt: Date;
  durationSeconds: number;
  /** Ключ идемпотентности: повторный импорт не создаст дубль. */
  externalId: string;
}

export interface ParseReport {
  calls: ParsedCall[];
  /** Строки, которые не удалось разобрать, с указанием причины. */
  rejected: Array<{ line: number; reason: string; raw: string }>;
}

/** Возможные названия столбцов. Регистр и пробелы не важны. */
const COLUMN_ALIASES = {
  employeePhone: ['номер абонента', 'абонент', 'msisdn', 'subscriber', 'номер'],
  clientPhone: ['номер б', 'вызываемый номер', 'b-number', 'called', 'контрагент'],
  direction: ['направление', 'тип', 'direction', 'call type'],
  startedAt: ['дата и время', 'дата', 'date', 'datetime', 'начало'],
  duration: ['длительность', 'продолжительность', 'duration'],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;

const normalizeHeader = (value: string): string =>
  value.trim().toLowerCase().replace(/[«»"']/g, '').replace(/\s+/g, ' ');

/** Разделитель определяем по строке заголовков, а не догадками. */
function detectDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t'];
  return candidates.reduce((best, candidate) =>
    headerLine.split(candidate).length > headerLine.split(best).length ? candidate : best,
  );
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      // Удвоенная кавычка внутри поля означает саму кавычку.
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * Сопоставление столбцов идёт в два прохода: сначала точные совпадения,
 * затем совпадения по началу строки.
 *
 * Порядок принципиален. Среди синонимов номера сотрудника есть общее слово
 * «номер», а заголовок клиентского столбца — «Номер Б» — тоже с него
 * начинается. При поиске в один проход номер клиента попал бы в поле
 * сотрудника, и звонки сопоставились бы не с теми людьми.
 *
 * Занятый столбец повторно не выдаётся, поэтому два поля не схлопнутся в одно.
 */
function mapColumns(headers: string[]): Partial<Record<ColumnKey, number>> {
  const normalized = headers.map(normalizeHeader);
  const mapping: Partial<Record<ColumnKey, number>> = {};
  const claimed = new Set<number>();

  const entries = Object.entries(COLUMN_ALIASES) as Array<[ColumnKey, readonly string[]]>;

  const claim = (key: ColumnKey, index: number): void => {
    mapping[key] = index;
    claimed.add(index);
  };

  for (const [key, aliases] of entries) {
    const index = normalized.findIndex(
      (header, position) => !claimed.has(position) && aliases.includes(header),
    );
    if (index >= 0) claim(key, index);
  }

  for (const [key, aliases] of entries) {
    if (mapping[key] !== undefined) continue;

    // Длинные синонимы проверяем первыми: они точнее коротких.
    const ordered = [...aliases].sort((a, b) => b.length - a.length);

    const index = normalized.findIndex(
      (header, position) =>
        !claimed.has(position) && ordered.some((alias) => header.startsWith(alias)),
    );
    if (index >= 0) claim(key, index);
  }

  return mapping;
}

const INBOUND_MARKERS = ['вход', 'incoming', 'inbound', 'in'];

function parseDirection(value: string | undefined): 'INBOUND' | 'OUTBOUND' {
  const normalized = (value ?? '').trim().toLowerCase();
  return INBOUND_MARKERS.some((marker) => normalized.startsWith(marker))
    ? 'INBOUND'
    : 'OUTBOUND';
}

/**
 * Дата в выгрузках приходит либо в ISO, либо в виде «25.09.2026 14:30:05».
 * Второй формат браузерный Date разбирает неверно, поэтому обрабатываем сами.
 */
export function parseCallDate(value: string): Date | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  const local = trimmed.match(
    /^(\d{2})[.\/](\d{2})[.\/](\d{4})[\sT]+(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (local) {
    const [, day, month, year, hours, minutes, seconds] = local;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds ?? '0'),
    );
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Идентификатор звонка в выгрузке отсутствует, поэтому собираем его сами
 * из номеров и времени начала. Повторный импорт того же файла даст те же
 * ключи, и дублей не появится.
 */
function buildExternalId(employeePhone: string, clientPhone: string, startedAt: Date): string {
  return `${employeePhone}_${clientPhone}_${startedAt.getTime()}`;
}

export function parseKcellExport(content: string): ParseReport {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const report: ParseReport = { calls: [], rejected: [] };

  if (lines.length < 2) return report;

  const delimiter = detectDelimiter(lines[0]);
  const columns = mapColumns(splitLine(lines[0], delimiter));

  const required: ColumnKey[] = ['employeePhone', 'clientPhone', 'startedAt'];
  const missing = required.filter((key) => columns[key] === undefined);

  if (missing.length > 0) {
    report.rejected.push({
      line: 1,
      reason: `В заголовке не найдены столбцы: ${missing.join(', ')}`,
      raw: lines[0],
    });
    return report;
  }

  lines.slice(1).forEach((line, index) => {
    const lineNumber = index + 2;
    const cells = splitLine(line, delimiter);

    const employeePhone = normalizePhone(cells[columns.employeePhone!]);
    const clientPhone = normalizePhone(cells[columns.clientPhone!]);

    if (!employeePhone || !clientPhone) {
      report.rejected.push({ line: lineNumber, reason: 'Не распознан номер', raw: line });
      return;
    }

    const startedAt = parseCallDate(cells[columns.startedAt!] ?? '');
    if (!startedAt) {
      report.rejected.push({ line: lineNumber, reason: 'Не распознана дата', raw: line });
      return;
    }

    report.calls.push({
      employeePhone,
      clientPhone,
      direction: parseDirection(columns.direction !== undefined ? cells[columns.direction] : undefined),
      startedAt,
      durationSeconds: parseDurationSeconds(
        columns.duration !== undefined ? cells[columns.duration] : 0,
      ),
      externalId: buildExternalId(employeePhone, clientPhone, startedAt),
    });
  });

  return report;
}
