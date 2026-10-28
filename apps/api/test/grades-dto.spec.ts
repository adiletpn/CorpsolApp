import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DEFAULT_GRADE_TIERS } from '@corpsol/shared';

import { AssignGradeDto, UpdateGradesDto } from '../src/payroll/dto';

/** Как ValidationPipe в main.ts: лишние поля — ошибка. */
const errors = (cls: new () => object, body: unknown) =>
  validateSync(plainToInstance(cls, body) as object, { whitelist: true, forbidNonWhitelisted: true });

describe('таблица рангов в запросе', () => {
  it('таблица «Новая система» проходит как есть', () => {
    expect(errors(UpdateGradesDto, { tiers: DEFAULT_GRADE_TIERS })).toHaveLength(0);
  });

  it('пустая таблица не проходит', () => {
    expect(errors(UpdateGradesDto, { tiers: [] })).not.toHaveLength(0);
  });

  it('ошибка внутри ранга видна: отрицательная ставка, дробный план', () => {
    const tiers = [{ ...DEFAULT_GRADE_TIERS[0], rateUnderMinor: -1, weekPlan: 6.5 }];
    const [error] = errors(UpdateGradesDto, { tiers });
    expect(error.property).toBe('tiers');
    expect(error.children?.[0].children?.map((child) => child.property).sort()).toEqual(['rateUnderMinor', 'weekPlan']);
  });

  it('лишнее поле в ранге отклоняется', () => {
    const tiers = [{ ...DEFAULT_GRADE_TIERS[0], bonus: 1 }];
    expect(errors(UpdateGradesDto, { tiers })).not.toHaveLength(0);
  });

  it('код ранга — латиница: кириллическая «А» не пройдёт', () => {
    const tiers = [{ ...DEFAULT_GRADE_TIERS[0], code: 'А' }];
    expect(errors(UpdateGradesDto, { tiers })).not.toHaveLength(0);
  });

  it('перевод на ранг требует сотрудника и код', () => {
    expect(errors(AssignGradeDto, { userId: 'u1', code: 'B' })).toHaveLength(0);
    expect(errors(AssignGradeDto, { userId: '', code: 'B' })).not.toHaveLength(0);
    expect(errors(AssignGradeDto, { userId: 'u1' })).not.toHaveLength(0);
  });
});
