import type { PanelClient, SyncResult } from './panel-client';
import type { Roster } from './roster';

type Client = Pick<
  PanelClient,
  | 'departments'
  | 'createDepartment'
  | 'setDepartmentHead'
  | 'offices'
  | 'employees'
  | 'createEmployee'
  | 'workNumbers'
  | 'linkWorkNumber'
  | 'sync'
>;

export interface OnboardRow {
  name: string;
  email: string;
  role: string;
  /** Временный пароль — только у заведённых сейчас; у прежних его не узнать. */
  password: string | null;
  status: 'created' | 'existing' | 'failed';
  links: string[];
  problems: string[];
}

export interface OnboardReport {
  department: { id: string; name: string; created: boolean };
  office: string | null;
  rows: OnboardRow[];
  head: string | null;
  sync: Partial<Record<'kcell' | 'sipuni', SyncResult | { error: string }>>;
}

/** Полночь дня по Алматы: звонки добираются с начала суток, а не с полуночи UTC. */
export function almatyMidnight(date: string): Date {
  return new Date(`${date}T00:00:00+05:00`);
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Заводит отдел по списку. Повторный запуск того же файла безопасен:
 * отдел и сотрудники находятся по имени и логину, привязки — по номеру,
 * и второй раз ничего не создаётся. Ошибка одного человека не останавливает
 * остальных — она попадает в его строку отчёта.
 */
export async function onboard(roster: Roster, client: Client): Promise<OnboardReport> {
  // Офис — до любых изменений: при неясном офисе не должно остаться
  // даже пустого отдела.
  const offices = await client.offices();
  let office: string | null = null;
  if (roster.officeId) {
    if (!offices.some((item) => item.id === roster.officeId)) throw new Error(`Офиса ${roster.officeId} нет в организации.`);
    office = roster.officeId;
  } else if (offices.length === 1) {
    office = offices[0].id;
  } else if (offices.length > 1) {
    throw new Error(`Офисов несколько — укажите "officeId": ${offices.map((item) => `${item.name} (${item.id})`).join(', ')}.`);
  }

  const departments = await client.departments();
  const found = departments.find((department) => sameName(department.name, roster.department));
  const department = found ?? (await client.createDepartment(roster.department));

  const byEmail = new Map((await client.employees()).map((employee) => [employee.email.toLowerCase(), employee]));
  const links = new Map((await client.workNumbers()).map((link) => [`${link.provider}:${link.workNumber}`, link.userId]));

  const rows: OnboardRow[] = [];
  let head: { id: string; name: string } | null = null;

  for (const person of roster.employees) {
    const row: OnboardRow = { name: person.name, email: person.email, role: person.role, password: null, status: 'existing', links: [], problems: [] };
    rows.push(row);

    let userId: string;
    const existing = byEmail.get(person.email);
    if (existing) {
      userId = existing.id;
      if (existing.departmentId !== department.id) {
        row.problems.push('уже заведён в другом отделе — не переносил, проверьте в панели');
      }
    } else {
      try {
        const created = await client.createEmployee({
          email: person.email,
          fullName: person.name,
          role: person.role,
          departmentId: department.id,
          officeId: office,
        });
        userId = created.id;
        row.password = created.temporaryPassword ?? null;
        row.status = 'created';
      } catch (cause) {
        row.status = 'failed';
        row.problems.push((cause as Error).message);
        continue;
      }
    }

    for (const [provider, key, label] of [
      ['KCELL_USER', person.kcell, 'Kcell'],
      ['SIPUNI', person.sipuni, 'Sipuni'],
    ] as const) {
      if (!key) continue;
      const owner = links.get(`${provider}:${key}`);
      if (owner === userId) {
        row.links.push(`${label} ${key}`);
        continue;
      }
      if (owner) {
        // Перепривязка отняла бы звонки у другого человека — только руками.
        row.problems.push(`${label} ${key} уже привязан к другому сотруднику`);
        continue;
      }
      try {
        await client.linkWorkNumber(userId, key, provider);
        links.set(`${provider}:${key}`, userId);
        row.links.push(`${label} ${key}`);
      } catch (cause) {
        row.problems.push((cause as Error).message);
      }
    }

    if (person.head) head = { id: userId, name: person.name };
  }

  if (head && department.head?.id !== head.id) await client.setDepartmentHead(department.id, head.id);

  const sync: OnboardReport['sync'] = {};
  if (roster.resyncSince) {
    const since = almatyMidnight(roster.resyncSince);
    for (const [pbx, used] of [
      ['kcell', roster.employees.some((person) => person.kcell)],
      ['sipuni', roster.employees.some((person) => person.sipuni)],
    ] as const) {
      if (!used) continue;
      sync[pbx] = await client.sync(pbx, since).catch((cause: Error) => ({ error: cause.message }));
    }
  }

  return {
    department: { id: department.id, name: department.name, created: !found },
    office,
    rows,
    head: head?.name ?? null,
    sync,
  };
}
