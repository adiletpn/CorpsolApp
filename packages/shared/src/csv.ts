/**
 * Сборка CSV для бухгалтерии.
 *
 * Файл открывают в Excel, и это диктует всё остальное: разделитель —
 * точка с запятой, потому что в русской локали запятая стоит внутри чисел;
 * в начало идёт BOM, иначе кириллица превращается в кракозябры.
 */

/** Разделитель колонок. Запятая в русской локали — разделитель дробной части. */
const SEPARATOR = ';';

/**
 * Метка кодировки в начале файла.
 *
 * Без неё Excel читает файл в однобайтовой кодировке системы, и все
 * фамилии приходят мусором. Для остальных программ BOM безвреден.
 */
export const CSV_BOM = '﻿';

/**
 * Символы, с которых Excel начинает считать ячейку формулой.
 *
 * Сотрудника могут звать так, что имя начнётся со знака равенства, —
 * но важнее, что имя приходит из формы и его туда можно вписать нарочно.
 * Открытый у бухгалтера файл выполнил бы такую «формулу» без вопросов.
 */
const FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r'];

/** Приводит значение к безопасной ячейке. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  let text = String(value);

  // Апостроф перед опасным началом: Excel покажет текст как есть
  // и не станет ничего вычислять.
  if (FORMULA_STARTERS.some((char) => text.startsWith(char))) {
    text = `'${text}`;
  }

  if (
    text.includes(SEPARATOR) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/** Деньги для бухгалтерии: из тиын в тенге, с запятой как у Excel. */
export function csvMoney(amountMinor: number): string {
  // Разряды не разделяем: пробел внутри числа Excel принимает за текст,
  // и колонка перестаёт суммироваться.
  return (amountMinor / 100).toFixed(2).replace('.', ',');
}

/**
 * Собирает файл целиком.
 *
 * Перевод строки — CRLF: так требует сам формат, и так файл открывается
 * одинаково в Windows, где он чаще всего и нужен.
 */
export function buildCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const lines = [headers.map(csvCell).join(SEPARATOR)];

  for (const row of rows) {
    lines.push(row.map(csvCell).join(SEPARATOR));
  }

  return CSV_BOM + lines.join('\r\n') + '\r\n';
}
