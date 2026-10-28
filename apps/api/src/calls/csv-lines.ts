/**
 * Строки CSV из выгрузок АТС: детализация Kcell и статистика Sipuni.
 * Поле в кавычках может содержать разделитель и удвоенную кавычку.
 */

/** Разделитель определяем по строке заголовков, а не догадками. */
export function detectDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t'];
  return candidates.reduce((best, candidate) =>
    headerLine.split(candidate).length > headerLine.split(best).length ? candidate : best,
  );
}

export function splitLine(line: string, delimiter: string): string[] {
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
