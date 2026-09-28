/** API работает с календарными датами «ГГГГ-ММ-ДД», а не с моментами времени. */
export function dateKey(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface Period {
  from: string;
  to: string;
}

/** Текущий месяц целиком — период по умолчанию для всех экранов. */
export function currentMonth(): Period {
  const now = new Date();
  return {
    from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

/** Суммы хранятся в тиынах, показываются в тенге. */
export function formatMoney(amountMinor: number): string {
  return `${Math.round(amountMinor / 100).toLocaleString('ru-RU')} ₸`;
}
