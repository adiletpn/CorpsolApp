/** Календарная дата «ГГГГ-ММ-ДД» — в таком виде её ждёт API. */
export function dateKey(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface Period {
  from: string;
  to: string;
}

/** Текущий месяц целиком — период по умолчанию для всех отчётов. */
export function currentMonth(): Period {
  const now = new Date();
  return {
    from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function formatMoney(amountMinor: number): string {
  return `${Math.round(amountMinor / 100).toLocaleString('ru-RU')} ₸`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Длительность разговора в виде «7 мин 30 с».
 *
 * Секунды показываем всегда: у звонков в колл-центре разница между
 * сорока секундами и двумя минутами — это разница между сбросом и разговором.
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '—';

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} с`;
  if (seconds === 0) return `${minutes} мин`;
  return `${minutes} мин ${seconds} с`;
}

/**
 * Телефон в виде «+7 707 111 22 33».
 *
 * Номера приходят из выгрузок оператора слитной строкой, а в таблице
 * их сверяют глазами с заявкой — читаемость здесь не косметика.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 11) return phone;

  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
}
