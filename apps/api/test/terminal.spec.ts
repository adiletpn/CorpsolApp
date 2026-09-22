import { QR_PERIOD_SECONDS, parseQrPayload } from '@corpsol/shared';

import { TerminalService } from '../src/attendance/terminal.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const TERMINAL_ID = 'terminal-1';
const SECRET = TerminalService.generateSecret();

function serviceFor({ isActive = true }: { isActive?: boolean } = {}): TerminalService {
  const firestore = new FakeFirestore();
  firestore.seed(COLLECTIONS.terminals, TERMINAL_ID, {
    officeId: 'office-1',
    name: 'Терминал у входа',
    secret: SECRET,
    isActive,
    accessTokenHash: null,
    tokenIssuedAt: null,
  });

  return new TerminalService(fakeFirebase(firestore));
}

describe('TerminalService (ротирующийся QR)', () => {
  it('выдаёт код, который проходит проверку сразу после выдачи', async () => {
    const service = serviceFor();
    const { payload } = await service.issueCode(TERMINAL_ID);

    const parsed = parseQrPayload(payload);
    expect(parsed).not.toBeNull();

    const verdict = await service.verify(parsed!);
    expect(verdict.valid).toBe(true);
    expect(verdict.expired).toBe(false);
  });

  it('не кладёт секрет терминала в QR-код', async () => {
    const service = serviceFor();
    const { payload } = await service.issueCode(TERMINAL_ID);
    expect(payload).not.toContain(SECRET);
  });

  it('признаёт код просроченным через две минуты — фото кода бесполезно', async () => {
    const service = serviceFor();
    const { payload } = await service.issueCode(TERMINAL_ID);
    const parsed = parseQrPayload(payload)!;

    const verdict = await service.verify(parsed, Date.now() + 120_000);

    expect(verdict.valid).toBe(false);
    expect(verdict.expired).toBe(true);
  });

  it('принимает соседнее окно — расхождение часов телефона не ломает отметку', async () => {
    const service = serviceFor();
    const { payload } = await service.issueCode(TERMINAL_ID);
    const parsed = parseQrPayload(payload)!;

    const verdict = await service.verify(parsed, Date.now() + QR_PERIOD_SECONDS * 1000);

    expect(verdict.valid).toBe(true);
  });

  it('отклоняет подделанную подпись', async () => {
    const service = serviceFor();
    const { payload } = await service.issueCode(TERMINAL_ID);
    const parsed = parseQrPayload(payload)!;

    const forged = { ...parsed, s: 'a'.repeat(parsed.s.length) };

    expect((await service.verify(forged)).valid).toBe(false);
  });

  it('отклоняет код отключённого терминала', async () => {
    const issuer = serviceFor();
    const { payload } = await issuer.issueCode(TERMINAL_ID);
    const parsed = parseQrPayload(payload)!;

    const disabled = serviceFor({ isActive: false });

    expect((await disabled.verify(parsed)).valid).toBe(false);
  });

  it('не принимает мусор вместо payload', () => {
    expect(parseQrPayload('не-json')).toBeNull();
    expect(parseQrPayload('{"v":1}')).toBeNull();
  });
});
