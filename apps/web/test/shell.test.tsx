import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { can, type Role } from '@corpsol/shared';

import { Shell } from '../components/Shell';
import type { Session } from '../lib/types';

/**
 * Меню собирается из той же матрицы прав, что проверяет сервер.
 * Подменяем только источник сессии — сама проверка прав настоящая.
 */
const sessionState = {
  session: null as Session | null,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
  can: (permission: Parameters<typeof can>[1]) =>
    sessionState.session ? can(sessionState.session.role, permission) : false,
};

vi.mock('../lib/session', () => ({
  useSession: () => sessionState,
}));

vi.mock('../components/LoginForm', () => ({
  LoginForm: () => <div>Вход в панель</div>,
}));

function renderAs(role: Role) {
  sessionState.session = {
    id: 'user-1',
    email: `${role.toLowerCase()}@corpsol.kz`,
    role,
    departmentId: 'dep-1',
    officeId: 'office-1',
    permissions: [],
  };

  return render(
    <Shell active="overview" onNavigate={() => {}}>
      <div>содержимое</div>
    </Shell>,
  );
}

const menuItems = () =>
  screen.getAllByRole('button').map((node) => node.textContent?.trim());

describe('меню: кто что видит', () => {
  it('супер-админ видит настройки и интеграции', () => {
    renderAs('SUPER_ADMIN');

    expect(menuItems()).toEqual(expect.arrayContaining(['Настройки', 'Интеграции']));
  });

  it('руководителю отдела настройки и интеграции не показываются', () => {
    renderAs('ROP');
    const items = menuItems();

    expect(items).not.toContain('Настройки');
    expect(items).not.toContain('Интеграции');
  });

  it('руководитель отдела видит свои рабочие разделы', () => {
    renderAs('ROP');

    expect(menuItems()).toEqual(
      expect.arrayContaining(['Планы', 'Звонки', 'Сделки']),
    );
  });

  it('ЧР видит сотрудников и устройства, но не журнал', () => {
    renderAs('HR');
    const items = menuItems();

    expect(items).toEqual(expect.arrayContaining(['Сотрудники', 'Устройства']));
    expect(items).not.toContain('Журнал');
  });

  it('директор видит сводку', () => {
    renderAs('DIRECTOR');

    expect(menuItems()).toContain('Сводка');
  });
});

describe('меню: менеджер', () => {
  it('разделы менеджеру видны, но до панели он не доходит', () => {
    renderAs('MOP');

    // У менеджера есть права на планы и рейтинг, поэтому меню их
    // показало бы. Не пускает его уровнем выше — в сессии, которая
    // отклоняет роль MOP целиком. Защита живёт в одном месте, а не
    // размазана по меню.
    expect(menuItems()).toEqual(
      expect.arrayContaining(['Планы', 'Рейтинг', 'Достижения']),
    );
    expect(menuItems()).not.toContain('Настройки');
  });
});

describe('меню: до загрузки и без сессии', () => {
  it('пока сессия грузится, разделы не мелькают', () => {
    sessionState.session = null;
    sessionState.loading = true;

    render(
      <Shell active="overview" onNavigate={() => {}}>
        <div>содержимое</div>
      </Shell>,
    );

    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
    sessionState.loading = false;
  });

  it('без сессии показывается вход, а не пустая панель', () => {
    sessionState.session = null;

    render(
      <Shell active="overview" onNavigate={() => {}}>
        <div>содержимое</div>
      </Shell>,
    );

    expect(screen.getByText('Вход в панель')).toBeInTheDocument();
  });
});
