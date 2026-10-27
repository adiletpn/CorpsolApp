import { describe, expect, it } from 'vitest';

import { ManagerNotAllowed } from '../lib/session';

describe('менеджер в панели', () => {
  it('отказ объясняет, куда идти', () => {
    const failure = new ManagerNotAllowed();

    // Сотрудник не должен гадать, почему его не пустили.
    expect(failure.message).toContain('Telegram');
  });

  it('это ошибка, а не тихий возврат пустой сессии', () => {
    // Молчаливый отказ выглядел бы как сбой загрузки.
    expect(new ManagerNotAllowed()).toBeInstanceOf(Error);
  });
});
