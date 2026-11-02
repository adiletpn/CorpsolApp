import { ROLES, type Role } from '@corpsol/shared';

import { normalizeIdentityKey } from '../calls/identity-keys';
import { loginFor } from './login';

/**
 * Список отдела для заведения одной командой — JSON-файл:
 *
 *   {
 *     "department": "Кванта",
 *     "resyncSince": "2026-10-01",
 *     "employees": [
 *       { "name": "Алимжан", "role": "ROP", "head": true },
 *       { "name": "Диас", "kcell": "yarik" },
 *       { "name": "Адема", "login": "adema", "sipuni": "911" }
 *     ]
 *   }
 *
 * Всё проверяется до первого запроса: ошибка в восьмой строке не должна
 * оставить в базе заведёнными первых семь.
 */
export interface RosterEmployee {
  name: string;
  email: string;
  role: Role;
  head: boolean;
  kcell: string | null;
  sipuni: string | null;
}

export interface Roster {
  department: string;
  officeId: string | null;
  /** С какого дня добрать звонки после привязки; null — не добирать. */
  resyncSince: string | null;
  employees: RosterEmployee[];
}

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function parseRoster(input: unknown): Roster {
  const errors: string[] = [];
  const raw = (input && typeof input === 'object' ? input : {}) as Raw;

  const department = text(raw.department);
  if (!department) errors.push('Не указан отдел: "department".');

  const resyncSince = text(raw.resyncSince);
  if (resyncSince && !/^\d{4}-\d{2}-\d{2}$/.test(resyncSince)) {
    errors.push(`"resyncSince" — дата вида 2026-10-01, а не «${resyncSince}».`);
  }

  const list = Array.isArray(raw.employees) ? (raw.employees as Raw[]) : [];
  if (list.length === 0) errors.push('Список "employees" пуст.');

  const employees: RosterEmployee[] = [];
  list.forEach((item, index) => {
    const where = `Строка ${index + 1}`;
    const name = text(item?.name);
    if (!name) {
      errors.push(`${where}: нет имени.`);
      return;
    }

    const role = (text(item.role) ?? 'MOP').toUpperCase() as Role;
    if (!ROLES.includes(role)) errors.push(`${where} (${name}): роль «${role}» — не одна из ${ROLES.join(', ')}.`);

    let email = '';
    try {
      email = loginFor(name, text(item.login) ?? undefined);
    } catch (cause) {
      errors.push(`${where}: ${(cause as Error).message}`);
    }

    // Ключи сразу в том виде, в каком их хранит привязка: «Yarik» и
    // «yarik» — один логин, и дубль должен найтись здесь, а не в базе.
    const rawKcell = text(item.kcell);
    const rawSipuni = text(item.sipuni);
    const kcell = rawKcell ? normalizeIdentityKey('KCELL_USER', rawKcell) : null;
    const sipuni = rawSipuni ? normalizeIdentityKey('SIPUNI', rawSipuni) : null;
    if (rawKcell && !kcell) errors.push(`${where} (${name}): логин Kcell «${rawKcell}» не подходит.`);
    if (rawSipuni && !sipuni) errors.push(`${where} (${name}): номер Sipuni «${rawSipuni}» не подходит.`);

    employees.push({ name, email, role, head: item.head === true, kcell, sipuni });
  });

  const seen = new Map<string, string>();
  for (const employee of employees) {
    for (const key of [employee.email, employee.kcell && `kcell:${employee.kcell}`, employee.sipuni && `sipuni:${employee.sipuni}`]) {
      if (!key) continue;
      const owner = seen.get(key);
      if (owner) errors.push(`«${key}» указан и у ${owner}, и у ${employee.name}.`);
      else seen.set(key, employee.name);
    }
  }

  const heads = employees.filter((employee) => employee.head);
  if (heads.length > 1) errors.push(`Руководитель отдела должен быть один, а отмечены: ${heads.map((h) => h.name).join(', ')}.`);
  if (heads.some((head) => head.role !== 'ROP')) errors.push('Руководителем отдела отмечен не РОП.');

  if (errors.length > 0) throw new RosterError(errors);
  return { department: department!, officeId: text(raw.officeId), resyncSince, employees };
}

/** Все ошибки списка разом: исправлять по одной за запуск — долго. */
export class RosterError extends Error {
  constructor(readonly problems: string[]) {
    super(`В списке ошибки:\n- ${problems.join('\n- ')}`);
  }
}
