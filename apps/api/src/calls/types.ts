/**
 * Звонок, разобранный из любого источника.
 *
 * Источники опознают сотрудника по-разному: в детализации Kcell это рабочий
 * номер, в Bitrix24 — идентификатор пользователя портала. Поэтому в общем
 * типе поле называется нейтрально, а способ сопоставления задаётся отдельно.
 */
export interface ImportedCall {
  /** Рабочий номер либо идентификатор пользователя в системе-источнике. */
  employeeKey: string;
  clientPhone: string;
  direction: 'INBOUND' | 'OUTBOUND';
  startedAt: Date;
  durationSeconds: number;
  /** Чистое время разговора. Для Kcell совпадает с длительностью. */
  talkSeconds: number;
  /** Ключ идемпотентности: повторный импорт не создаёт дубль. */
  externalId: string;
}

/**
 * Как искать сотрудника по ключу из выгрузки.
 * `phone` — сверять телефоны с приведением к одному виду;
 * `externalKey` — точное совпадение с заведённым идентификатором.
 */
export type MatchBy = 'phone' | 'externalKey';

export interface ImportReport {
  calls: ImportedCall[];
  /** Строки или записи, которые не удалось разобрать, с указанием причины. */
  rejected: Array<{ line: number; reason: string; raw: string }>;
}
