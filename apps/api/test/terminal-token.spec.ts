import { TerminalService } from '../src/attendance/terminal.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

function setup(terminalIds: string[]): { service: TerminalService; firestore: FakeFirestore } {
  const firestore = new FakeFirestore();

  for (const id of terminalIds) {
    firestore.seed(COLLECTIONS.terminals, id, {
      officeId: 'office-1',
      name: id,
      secret: TerminalService.generateSecret(),
      isActive: true,
      accessTokenHash: null,
      tokenIssuedAt: null,
    });
  }

  return { service: new TerminalService(fakeFirebase(firestore)), firestore };
}

describe('токен экрана терминала', () => {
  it('принимает только что выпущенный токен', async () => {
    const { service } = setup(['t1']);

    const { token } = await service.issueAccessToken('t1');

    await expect(service.resolveByAccessToken('t1', token)).resolves.toBe('t1');
  });

  it('не хранит токен в открытом виде', async () => {
    const { service, firestore } = setup(['t1']);

    const { token } = await service.issueAccessToken('t1');
    const stored = firestore.read(COLLECTIONS.terminals, 't1');

    expect(stored?.accessTokenHash).toBeTruthy();
    expect(stored?.accessTokenHash).not.toBe(token);
  });

  it('обесценивает прежний токен при перевыпуске', async () => {
    const { service } = setup(['t1']);

    const first = await service.issueAccessToken('t1');
    const second = await service.issueAccessToken('t1');

    await expect(service.resolveByAccessToken('t1', first.token)).rejects.toThrow();
    await expect(service.resolveByAccessToken('t1', second.token)).resolves.toBe('t1');
  });

  it('не пускает токен одного терминала к другому', async () => {
    const { service } = setup(['t1', 't2']);

    const { token } = await service.issueAccessToken('t1');

    await expect(service.resolveByAccessToken('t2', token)).rejects.toThrow();
  });

  it('отклоняет токен отключённого терминала', async () => {
    const { service, firestore } = setup(['t1']);

    const { token } = await service.issueAccessToken('t1');
    firestore.seed(COLLECTIONS.terminals, 't1', {
      ...firestore.read(COLLECTIONS.terminals, 't1')!,
      isActive: false,
    });

    await expect(service.resolveByAccessToken('t1', token)).rejects.toThrow();
  });

  it('отклоняет запрос, если токен ещё не выпускался', async () => {
    const { service } = setup(['t1']);

    await expect(service.resolveByAccessToken('t1', 'что-угодно')).rejects.toThrow();
  });
});
