import { describe, expect, it } from 'vitest';

import {
  answeredToPass,
  dayPasses,
  formatDate,
  initialsOf,
  monthRange,
  percent,
  plural,
} from '../src/format';

describe('зачёт дня по дозвонам', () => {
  it('ровно 75% — в зачёте', () => {
    expect(dayPasses(20, 15)).toBe(true);
  });

  it('без звонков — не в зачёте', () => {
    expect(dayPasses(0, 0)).toBe(false);
  });

  it('подсказывает, сколько дозвонов подряд вернут день', () => {
    // 10 из 20: после 20 успешных подряд будет 30 из 40 = 75%.
    expect(answeredToPass(20, 10)).toBe(20);
    expect(dayPasses(40, 30)).toBe(true);
    expect(dayPasses(39, 29)).toBe(false);
  });

  it('пустому дню нужен хотя бы один звонок', () => {
    expect(answeredToPass(0, 0)).toBe(1);
  });

  it('в зачёте — ничего не нужно', () => {
    expect(answeredToPass(4, 3)).toBe(0);
  });
});

describe('проценты', () => {
  it('округляет вниз: 74,9% — ещё не 75%', () => {
    expect(percent(749, 1000)).toBe(74);
  });

  it('на нуле не делит', () => {
    expect(percent(0, 0)).toBe(0);
  });
});

describe('склонение', () => {
  it.each([
    [1, 'звонок'],
    [3, 'звонка'],
    [11, 'звонков'],
    [21, 'звонок'],
    [25, 'звонков'],
  ])('%i — %s', (value, word) => {
    expect(plural(value, 'звонок', 'звонка', 'звонков')).toBe(word);
  });
});

describe('границы месяца', () => {
  it('февраль високосного года', () => {
    expect(monthRange(new Date(2028, 1, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('дата в строке табеля', () => {
  it('пишется словами, как во Flutter', () => {
    expect(formatDate('2026-10-27')).toBe('27 октября');
  });

  it('принимает и момент с временем', () => {
    // unlockedAt у наград приходит полным ISO, а не датой.
    expect(formatDate('2026-10-09T12:00:00.000Z')).toBe('9 октября');
  });
});

describe('инициалы для аватара', () => {
  it('берёт первые буквы имени и фамилии', () => {
    expect(initialsOf('Адилет Серикбаев')).toBe('АС');
  });

  it('отчество не добавляет третью букву', () => {
    // В кружке помещаются две буквы — третья вылезла бы за край.
    expect(initialsOf('Айгерим Болатовна Нурланова')).toBe('АБ');
  });

  it('лишние пробелы не дают пустых букв', () => {
    expect(initialsOf('  Мадина   Касымова ')).toBe('МК');
  });
});
