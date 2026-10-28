import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let syncResult: unknown = {};

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    return path.endsWith('/sync') ? syncResult : {};
  }),
}));

import { PbxIntegration } from '../components/PbxIntegration';

const KCELL_FIELDS = [
  { name: 'baseUrl', label: 'Адрес API', initial: 'https://corpsol.vpbx.kcell.kz/crmapi/v1' },
  { name: 'apiKey', label: 'Ключ API', secret: true },
];

beforeEach(() => {
  requests.length = 0;
});

describe('карточка АТС', () => {
  it('подключение уходит без пробелов по краям, ключ после отправки стёрт', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <PbxIntegration
        title="Kcell — АТС"
        name="Kcell"
        path="kcell"
        keyLabel="логин Kcell"
        state={undefined}
        fields={KCELL_FIELDS}
        hint=""
        onChanged={onChanged}
      />,
    );

    await user.type(screen.getByLabelText('Ключ API'), '  secret-key  ');
    await user.click(screen.getByRole('button', { name: 'Подключить Kcell' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(requests[0]).toEqual({
      path: '/calls/integrations/kcell',
      options: { method: 'POST', body: { baseUrl: 'https://corpsol.vpbx.kcell.kz/crmapi/v1', apiKey: 'secret-key' } },
    });
    expect((screen.getByLabelText('Ключ API') as HTMLInputElement).value).toBe('');
  });

  it('после добора видно, кого не к кому привязать', async () => {
    syncResult = {
      fetched: 40,
      imported: 38,
      duplicates: 0,
      withoutEmployee: 3,
      unmatched: [{ employeeKey: 'saida', count: 2 }],
    };
    const user = userEvent.setup();
    render(
      <PbxIntegration
        title="Kcell — АТС"
        name="Kcell"
        path="kcell"
        keyLabel="логин Kcell"
        state={{ isActive: true, credentialsMasked: 'corpsol.vpbx.kcell.kz · ключ kce…ey', lastSyncAt: null, lastSyncStatus: null, lastSyncError: null }}
        fields={KCELL_FIELDS}
        hint=""
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Добрать звонки/ }));

    expect(await screen.findByText(/saida — 2/)).toBeInTheDocument();
    expect(screen.getByText(/без сотрудника 3/)).toBeInTheDocument();
    expect(requests[0].path).toBe('/calls/integrations/kcell/sync');
  });

  it('подключённая АТС показывает только маску доступа', () => {
    render(
      <PbxIntegration
        title="Sipuni"
        name="Sipuni"
        path="sipuni"
        keyLabel="номер Sipuni"
        state={{ isActive: true, credentialsMasked: 'аккаунт 012345 · секрет sip…et', lastSyncAt: null, lastSyncStatus: 'ERROR', lastSyncError: 'Sipuni вернул страницу вместо выгрузки' }}
        fields={[]}
        hint=""
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('аккаунт 012345 · секрет sip…et')).toBeInTheDocument();
    expect(screen.getByText('ошибка')).toBeInTheDocument();
    expect(screen.getByText('Sipuni вернул страницу вместо выгрузки')).toBeInTheDocument();
  });
});
