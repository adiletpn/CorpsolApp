import { BonusRulesService } from '../src/payroll/bonus-rules.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const director = {
  id: 'dir-1',
  organizationId: ORG,
  email: 'dir@corpsol.kz',
  role: 'DIRECTOR',
  departmentId: null,
  officeId: null,
  deviceId: null,
} as AuthenticatedUser;

const base = {
  kind: 'ATTENDANCE' as const,
  threshold: 0,
  amountMinor: 500_000,
  percentBps: 0,
};

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new BonusRulesService(fakeFirebase(firestore)) };
}

describe('правило должно что-то начислять', () => {
  it('без суммы и без процента не заводится', async () => {
    const { service } = setup();

    // Молчаливое правило-пустышка потом ищут часами: премия не начислилась,
    // а правило вроде бы есть.
    await expect(
      service.create(director, { ...base, amountMinor: 0, percentBps: 0 }),
    ).rejects.toThrow(/без суммы и без процента/);
  });

  it('фиксированная сумма принимается', async () => {
    const { service } = setup();

    const rule = await service.create(director, base);

    expect(rule.amountMinor).toBe(500_000);
  });

  it('один процент без суммы принимается', async () => {
    const { service } = setup();

    const rule = await service.create(director, {
      ...base,
      amountMinor: 0,
      percentBps: 1_000,
    });

    expect(rule.percentBps).toBe(1_000);
  });

  it('сумма и процент вместе допустимы', async () => {
    const { service } = setup();

    const rule = await service.create(director, { ...base, percentBps: 500 });

    expect(rule.amountMinor).toBe(500_000);
    expect(rule.percentBps).toBe(500);
  });
});

describe('метрика у правил по показателям', () => {
  it('выполнение плана без метрики не заводится', async () => {
    const { service } = setup();

    // Непонятно, что считать выполненным: звонки, выручку или сделки.
    await expect(
      service.create(director, { ...base, kind: 'PLAN_COMPLETION', threshold: 100 }),
    ).rejects.toThrow(/нужно указать метрику/);
  });

  it('оплата за единицу без метрики не заводится', async () => {
    const { service } = setup();

    await expect(
      service.create(director, { ...base, kind: 'PER_UNIT' }),
    ).rejects.toThrow(/нужно указать метрику/);
  });

  it('с метрикой заводится', async () => {
    const { service } = setup();

    const rule = await service.create(director, {
      ...base,
      kind: 'PLAN_COMPLETION',
      metric: 'REVENUE',
      threshold: 100,
    });

    expect(rule.metric).toBe('REVENUE');
  });

  it('правилу за посещаемость метрика не нужна', async () => {
    const { service } = setup();

    const rule = await service.create(director, base);

    expect(rule.metric).toBeNull();
  });

  it('штрафу за опоздание метрика не нужна', async () => {
    const { service } = setup();

    const rule = await service.create(director, { ...base, kind: 'LATE_PENALTY' });

    expect(rule.kind).toBe('LATE_PENALTY');
  });
});

describe('область действия правила', () => {
  it('без отдела правило общее для компании', async () => {
    const { service } = setup();

    const rule = await service.create(director, base);

    expect(rule.departmentId).toBeNull();
  });

  it('с отделом правило действует только в нём', async () => {
    const { service } = setup();

    const rule = await service.create(director, { ...base, departmentId: 'dep-1' });

    expect(rule.departmentId).toBe('dep-1');
  });

  it('правило помечается организацией', async () => {
    const { service } = setup();

    const rule = await service.create(director, base);

    expect(rule.organizationId).toBe(ORG);
  });

  it('новое правило включено по умолчанию', async () => {
    const { service } = setup();

    const rule = await service.create(director, base);

    expect(rule.isActive).toBe(true);
  });

  it('правило можно завести сразу выключенным', async () => {
    const { service } = setup();

    // Подготовить правило заранее и включить с началом периода — нормальный ход.
    const rule = await service.create(director, { ...base, isActive: false });

    expect(rule.isActive).toBe(false);
  });
});
