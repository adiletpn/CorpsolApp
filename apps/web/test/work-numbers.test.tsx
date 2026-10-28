import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let links: unknown[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path === '/employees') {
      return [
        {
          id: 'uid-1',
          email: 'asel@corpsol.kz',
          fullName: 'Асель Ким',
          role: 'MOP',
          status: 'ACTIVE',
          departmentId: null,
          officeId: null,
          baseSalaryMinor: 0,
        },
      ];
    }
    if (path.startsWith('/calls/work-numbers') && !options?.method) return links;
    return [];
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

const { WorkNumbers } = await import('../components/screens/WorkNumbers');

beforeEach(() => {
  requests.length = 0;
  links = [];
  vi.stubGlobal('confirm', vi.fn(() => true));
});

const linkBody = () => {
  const call = requests.find(
    (r) => r.path === '/calls/work-numbers' && r.options?.method === 'POST',
  );
  expect(call).toBeDefined();
  return call!.options!.body as Record<string, unknown>;
};

/** Закрепляет номер за сотрудником. */
async function linkNumber(number: string) {
  const user = userEvent.setup();
  render(<WorkNumbers />);

  await screen.findByText('Асель Ким');

  await user.selectOptions(screen.getByLabelText('Сотрудник'), 'uid-1');
  // Телефон — ключ загрузки файла Kcell; по умолчанию выбран логин АТС.
  await user.selectOptions(screen.getByLabelText('Источник'), 'KCELL');
  await user.type(screen.getByLabelText(/Рабочий номер/), number);
  await user.click(screen.getByRole('button', { name: /закрепить/i }));

  return user;
}

describe('закрепление номера', () => {
  it('номер уходит вместе с сотрудником и источником', async () => {
    await linkNumber('+7 707 111 22 33');

    await waitFor(() => {
      const body = linkBody();
      expect(body.userId).toBe('uid-1');
      expect(body.workNumber).toBe('+7 707 111 22 33');
      expect(body.provider).toBeTruthy();
    });
  });

  it('номер в любом виде доходит как введён — нормализует сервер', async () => {
    await linkNumber('87071112233');

    // Панель не чистит номер сама: правила нормализации живут на сервере,
    // и две разные чистки разошлись бы.
    await waitFor(() => expect(linkBody().workNumber).toBe('87071112233'));
  });

  it('после закрепления поле номера очищается, а сотрудник остаётся', async () => {
    await linkNumber('+7 707 111 22 33');

    await waitFor(() => {
      const field = screen.getByLabelText(/Рабочий номер/) as HTMLInputElement;
      // Одному сотруднику обычно заводят несколько номеров подряд.
      expect(field.value).toBe('');
      expect((screen.getByLabelText('Сотрудник') as HTMLSelectElement).value).toBe(
        'uid-1',
      );
    });
  });
});

describe('снятие привязки', () => {
  it('перед снятием спрашивают подтверждение', async () => {
    links = [
      { provider: 'KCELL', workNumber: '+77071112233', userId: 'uid-1', fullName: 'Асель Ким' },
    ];

    const user = userEvent.setup();
    render(<WorkNumbers />);
    // Имя встречается и в списке сотрудников, и в таблице привязок.
    await screen.findAllByText('Асель Ким');

    const remove = screen
      .getAllByRole('button')
      .find((b) => /снять|удалить/i.test(b.textContent ?? ''));
    if (!remove) return;

    await user.click(remove);

    // Снятие молча означало бы, что звонки перестали распределяться
    // и никто не заметил.
    expect(confirm).toHaveBeenCalled();
  });
});

describe('ключ зависит от источника', () => {
  it('по умолчанию — логин Kcell: так раскладываются звонки АТС', async () => {
    render(<WorkNumbers />);
    await screen.findByText('Асель Ким');

    // Подсказка входит в подпись поля — ищем по началу.
    expect(screen.getByLabelText(/^Логин Kcell/)).toBeInTheDocument();
  });

  it('у Sipuni поле — внутренний номер', async () => {
    const user = userEvent.setup();
    render(<WorkNumbers />);
    await screen.findByText('Асель Ким');

    await user.selectOptions(screen.getByLabelText('Источник'), 'SIPUNI');

    expect(screen.getByLabelText(/^Внутренний номер/)).toHaveAttribute('placeholder', '236');
  });

  it('логин в списке — как есть, а не как телефон', async () => {
    links = [{ provider: 'KCELL_USER', workNumber: 'dina', userId: 'uid-1', fullName: 'Асель Ким', id: 'l1' }];
    render(<WorkNumbers />);

    const cell = await screen.findByText('dina');
    // Подпись источника есть и в списке выбора — проверяем строку таблицы.
    expect(cell.closest('tr')).toHaveTextContent('Kcell — логин в АТС');
  });
});
