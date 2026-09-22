import { TerminalService } from '../src/attendance/terminal.service';
import type { PrismaService } from '../src/prisma/prisma.service';

interface TerminalRow {
  id: string;
  secret: string;
  isActive: boolean;
  accessTokenHash: string | null;
  tokenIssuedAt: Date | null;
}

/** Поднимает сервис поверх минимальной таблицы терминалов в памяти. */
function serviceWith(rows: TerminalRow[]): TerminalService {
  const prisma = {
    terminal: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<TerminalRow> }) => {
        const row = rows.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  } as unknown as PrismaService;

  return new TerminalService(prisma);
}

function makeRow(id: string): TerminalRow {
  return {
    id,
    secret: TerminalService.generateSecret(),
    isActive: true,
    accessTokenHash: null,
    tokenIssuedAt: null,
  };
}

describe('токен экрана терминала', () => {
  it('принимает только что выпущенный токен', async () => {
    const rows = [makeRow('t1')];
    const service = serviceWith(rows);

    const { token } = await service.issueAccessToken('t1');

    await expect(service.resolveByAccessToken('t1', token)).resolves.toBe('t1');
  });

  it('не хранит токен в открытом виде', async () => {
    const rows = [makeRow('t1')];
    const service = serviceWith(rows);

    const { token } = await service.issueAccessToken('t1');

    expect(rows[0].accessTokenHash).not.toBeNull();
    expect(rows[0].accessTokenHash).not.toBe(token);
  });

  it('обесценивает прежний токен при перевыпуске', async () => {
    const rows = [makeRow('t1')];
    const service = serviceWith(rows);

    const first = await service.issueAccessToken('t1');
    const second = await service.issueAccessToken('t1');

    await expect(service.resolveByAccessToken('t1', first.token)).rejects.toThrow();
    await expect(service.resolveByAccessToken('t1', second.token)).resolves.toBe('t1');
  });

  it('не пускает токен одного терминала к другому', async () => {
    const rows = [makeRow('t1'), makeRow('t2')];
    const service = serviceWith(rows);

    const { token } = await service.issueAccessToken('t1');

    await expect(service.resolveByAccessToken('t2', token)).rejects.toThrow();
  });

  it('отклоняет токен отключённого терминала', async () => {
    const rows = [makeRow('t1')];
    const service = serviceWith(rows);

    const { token } = await service.issueAccessToken('t1');
    rows[0].isActive = false;

    await expect(service.resolveByAccessToken('t1', token)).rejects.toThrow();
  });

  it('отклоняет запрос, если токен ещё не выпускался', async () => {
    const service = serviceWith([makeRow('t1')]);

    await expect(service.resolveByAccessToken('t1', 'что-угодно')).rejects.toThrow();
  });
});
