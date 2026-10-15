import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    return [];
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: {
      id: 'admin-1',
      email: 'admin@corpsol.kz',
      role: 'SUPER_ADMIN' as const,
      departmentId: null,
      officeId: null,
      permissions: [],
    },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('SUPER_ADMIN', permission),
  }),
}));

const { Settings } = await import('../components/screens/Settings');

beforeEach(() => {
  requests.length = 0;
});

const officeBody = () => {
  const call = requests.find(
    (r) => r.path === '/offices' && r.options?.method === 'POST',
  );
  expect(call).toBeDefined();
  return call!.options!.body as Record<string, unknown>;
};

/** Заполняет форму офиса и отправляет её. */
async function createOffice(wifi?: string) {
  const user = userEvent.setup();
  render(<Settings />);

  await screen.findByText('Новый офис');

  await user.type(screen.getByLabelText('Название'), 'Главный офис');
  await user.type(screen.getByLabelText('Широта'), '43.238949');
  await user.type(screen.getByLabelText('Долгота'), '76.889709');
  if (wifi) await user.type(screen.getByLabelText(/Wi-Fi/), wifi);

  await user.click(screen.getByRole('button', { name: /создать офис|добавить офис/i }));
}

describe('офис: координаты', () => {
  it('широта и долгота уходят числами, а не строками', async () => {
    await createOffice();

    await waitFor(() => {
      const body = officeBody();
      // Строка вместо числа сломала бы расчёт расстояния до офиса.
      expect(body.lat).toBe(43.238949);
      expect(body.lng).toBe(76.889709);
    });
  });

  it('дробная часть координат не теряется', async () => {
    await createOffice();

    await waitFor(() => {
      // Шесть знаков после запятой — это примерно десять сантиметров.
      // Потеря дробной части сдвинула бы офис на сотни километров.
      expect(String(officeBody().lat)).toContain('.238949');
    });
  });

  it('радиус уходит числом', async () => {
    await createOffice();

    await waitFor(() => expect(typeof officeBody().radiusMeters).toBe('number'));
  });
});

describe('офис: сети Wi-Fi', () => {
  it('несколько адресов через запятую разбираются в список', async () => {
    await createOffice('A1:B2:C3:D4:E5:F6, 11:22:33:44:55:66');

    await waitFor(() =>
      expect(officeBody().wifiBssids).toEqual([
        'A1:B2:C3:D4:E5:F6',
        '11:22:33:44:55:66',
      ]),
    );
  });

  it('адреса через пробел и точку с запятой тоже', async () => {
    await createOffice('A1:B2:C3:D4:E5:F6 11:22:33:44:55:66;AA:BB:CC:DD:EE:FF');

    await waitFor(() => expect(officeBody().wifiBssids).toHaveLength(3));
  });

  it('пустое поле даёт пустой список, а не строку из пустоты', async () => {
    await createOffice();

    await waitFor(() => {
      // Пустой список намеренно отключает проверку по Wi-Fi.
      // Список из одной пустой строки отключил бы отметку вообще.
      expect(officeBody().wifiBssids).toEqual([]);
    });
  });

  it('лишние запятые не превращаются в пустые адреса', async () => {
    await createOffice('A1:B2:C3:D4:E5:F6,,  ,11:22:33:44:55:66');

    await waitFor(() => expect(officeBody().wifiBssids).toHaveLength(2));
  });
});

describe('офис: необязательный адрес', () => {
  it('пустой адрес не уходит пустой строкой', async () => {
    await createOffice();

    // Пустая строка в базе выглядит как заполненное поле.
    await waitFor(() => expect(officeBody().address).toBeUndefined());
  });
});

describe('предупреждение о факторе Wi-Fi', () => {
  it('пустое поле сетей не пугает администратора', async () => {
    render(<Settings />);

    await screen.findByText('Новый офис');
    expect(screen.queryByText(/Проверка включится сразу/)).not.toBeInTheDocument();
  });

  it('заполненное поле объясняет цену решения', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await screen.findByText('Новый офис');
    await user.type(screen.getByLabelText(/Wi-Fi офиса/), 'A1:B2:C3:D4:E5:F6');

    // Четвёртый фактор включается сразу для всех: сотрудник вне сети
    // не отметится, даже стоя в офисе.
    expect(await screen.findByText(/Проверка включится сразу/)).toBeInTheDocument();
  });

  it('предупреждение называет iPhone отдельно', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await screen.findByText('Новый офис');
    await user.type(screen.getByLabelText(/Wi-Fi офиса/), 'A1:B2:C3:D4:E5:F6');

    // На iOS адрес точки доступа закрыт разрешением Apple — без него
    // владельцы айфонов перестанут отмечаться вовсе.
    expect(await screen.findByText(/iPhone/)).toBeInTheDocument();
  });
});
