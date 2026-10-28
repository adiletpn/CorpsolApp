import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let printedVersion: number | null = null;

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`) },
}));

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path === '/offices') return [{ id: 'office-1', name: 'Главный офис', lat: 43, lng: 76, radiusMeters: 100, wifiBssids: [], address: null }];
    if (path === '/terminals') {
      return [{ id: 'term-1', officeId: 'office-1', name: 'Вход', isActive: true, hasAccessToken: false, tokenIssuedAt: null, printedVersion, createdAt: '2026-10-01T00:00:00Z' }];
    }
    if (path.endsWith('/printed-code') && options?.method === 'POST') return { payload: '{"v":1,"t":"term-1","c":1,"s":"sig","p":1}', version: 1 };
    return [];
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: { id: 'admin-1', email: 'admin@corpsol.kz', role: 'SUPER_ADMIN' as const, departmentId: null, officeId: null, permissions: [] },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('SUPER_ADMIN', permission),
  }),
}));

const { Settings } = await import('../components/screens/Settings');

beforeEach(() => {
  requests.length = 0;
  printedVersion = null;
});

describe('QR на листок для двери', () => {
  it('печать готовит листок с кодом, офисом и номером печати', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(await screen.findByRole('button', { name: 'QR на листок' }));

    const image = (await screen.findByAltText('QR терминала Вход')) as HTMLImageElement;
    expect(atob(image.src.split(',')[1])).toContain('"p":1');
    expect(screen.getByText('Главный офис · Вход · печать №1')).toBeTruthy();
    expect(requests).toContainEqual({ path: '/terminals/term-1/printed-code', options: { method: 'POST', body: {} } });
  });

  it('перепечатка спрашивает подтверждение: старый листок перестанет работать', async () => {
    printedVersion = 2;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(await screen.findByRole('button', { name: 'Перепечатать QR' }));

    expect(confirm).toHaveBeenCalled();
    expect(requests.some((r) => r.path.endsWith('/printed-code'))).toBe(false);
    confirm.mockRestore();
  });

  it('снять листок', async () => {
    printedVersion = 2;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<Settings />);

    expect(await screen.findByText('листок №2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Снять листок' }));

    await waitFor(() =>
      expect(requests).toContainEqual({ path: '/terminals/term-1/printed-code', options: { method: 'DELETE' } }),
    );
    confirm.mockRestore();
  });
});
