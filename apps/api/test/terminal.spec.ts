import { QR_PERIOD_SECONDS, parseQrPayload } from '@corpsol/shared';

import { TerminalService } from '../src/attendance/terminal.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const TERMINAL = {
  id: 'terminal-1',
  secret: TerminalService.generateSecret(),
  isActive: true,
};

function serviceFor(terminal: typeof TERMINAL | null): TerminalService {
  const prisma = {
    terminal: { findUnique: jest.fn().mockResolvedValue(terminal) },
  } as unknown as PrismaService;
  return new TerminalService(prisma);
}

describe('TerminalService (ротирующийся QR)', () => {
  it('выдаёт код, который проходит проверку сразу после выдачи', async () => {
    const service = serviceFor(TERMINAL);
    const { payload } = await service.issueCode(TERMINAL.id);

    const parsed = parseQrPayload(payload);
    expect(parsed).not.toBeNull();

    const verdict = await service.verify(parsed!);
    expect(verdict.valid).toBe(true);
    expect(verdict.expired).toBe(false);
  });

  it('не кладёт секрет терминала в QR-код', async () => {
    const service = serviceFor(TERMINAL);
    const { payload } = await service.issueCode(TERMINAL.id);
    expect(payload).not.toContain(TERMINAL.secret);
  });

  it('признаёт код просроченным через две минуты — фото кода бесполезно', async () => {
    const service = serviceFor(TERMINAL);
    const { payload } = await service.issueCode(TERMINAL.id);
    const parsed = parseQrPayload(payload)!;

    const twoMinutesLater = Date.now() + 120_000;
    const verdict = await service.verify(parsed, twoMinutesLater);

    expect(verdict.valid).toBe(false);
    expect(verdict.expired).toBe(true);
  });

  it('принимает соседнее окно — расхождение часов телефона не ломает отметку', async () => {
    const service = serviceFor(TERMINAL);
    const { payload } = await service.issueCode(TERMINAL.id);
    const parsed = parseQrPayload(payload)!;

    const oneWindowLater = Date.now() + QR_PERIOD_SECONDS * 1000;
    const verdict = await service.verify(parsed, oneWindowLater);

    expect(verdict.valid).toBe(true);
  });

  it('отклоняет подделанную подпись', async () => {
    const service = serviceFor(TERMINAL);
    const { payload } = await service.issueCode(TERMINAL.id);
    const parsed = parseQrPayload(payload)!;

    const forged = { ...parsed, s: 'a'.repeat(parsed.s.length) };
    const verdict = await service.verify(forged);

    expect(verdict.valid).toBe(false);
  });

  it('отклоняет код отключённого терминала', async () => {
    const issuer = serviceFor(TERMINAL);
    const { payload } = await issuer.issueCode(TERMINAL.id);
    const parsed = parseQrPayload(payload)!;

    const disabled = serviceFor({ ...TERMINAL, isActive: false });
    const verdict = await disabled.verify(parsed);

    expect(verdict.valid).toBe(false);
  });

  it('не принимает мусор вместо payload', () => {
    expect(parseQrPayload('не-json')).toBeNull();
    expect(parseQrPayload('{"v":1}')).toBeNull();
  });
});
