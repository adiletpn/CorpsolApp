/**
 * Роли системы. Порядок важен: чем выше индекс, тем шире полномочия.
 * MOP     — менеджер отдела продаж, видит только себя + общий план отдела
 * ROP     — руководитель отдела продаж, видит свой отдел целиком
 * HR      — заводит и увольняет сотрудников, не видит финансовую аналитику
 * DIRECTOR— сводная аналитика по всей компании
 * SUPER_ADMIN — учётки и настройки системы
 */
export const ROLES = ['MOP', 'ROP', 'HR', 'DIRECTOR', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  MOP: 'Менеджер',
  ROP: 'Руководитель отдела',
  HR: 'HR / ЧР',
  DIRECTOR: 'Директор',
  SUPER_ADMIN: 'Супер-админ',
};

/**
 * Атомарные разрешения. Гварды на бэкенде и меню на клиентах читают
 * один и тот же список, чтобы права не разъезжались между слоями.
 */
export const PERMISSIONS = [
  // учётные записи и настройки
  'account.create',
  'account.delete',
  'account.role.assign',
  'settings.manage',
  'integration.manage',
  'office.manage',
  'device.unbind',

  // сотрудники
  'employee.create',
  'employee.terminate',
  'employee.read.all',
  'employee.read.department',
  'employee.read.self',

  // посещаемость
  'attendance.read.all',
  'attendance.read.department',
  'attendance.read.self',
  'attendance.checkin',
  'attendance.adjust',

  // звонки
  'calls.read.all',
  'calls.read.department',
  'calls.read.self',

  // планы
  'plan.manage',
  'plan.read.all',
  'plan.read.department',
  'plan.read.self',

  // деньги
  'payroll.read.all',
  'payroll.read.department',
  'payroll.read.self',
  'payroll.manage',

  // офферы
  'offer.read.all',
  'offer.read.department',
  'offer.read.self',
  'offer.create',

  // аналитика и геймификация
  'analytics.company',
  'analytics.department',
  'leaderboard.read',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MOP_PERMISSIONS: Permission[] = [
  'employee.read.self',
  'attendance.read.self',
  'attendance.checkin',
  'calls.read.self',
  // МОП видит выполнение ОБЩЕГО плана отдела, но не результаты коллег поимённо
  'plan.read.department',
  'plan.read.self',
  'payroll.read.self',
  'offer.read.self',
  'offer.create',
  'leaderboard.read',
];

const ROP_PERMISSIONS: Permission[] = [
  ...MOP_PERMISSIONS,
  'employee.read.department',
  'attendance.read.department',
  'attendance.adjust',
  'calls.read.department',
  'plan.read.all',
  'payroll.read.department',
  'offer.read.department',
  'analytics.department',
];

const HR_PERMISSIONS: Permission[] = [
  'employee.create',
  'employee.terminate',
  'employee.read.all',
  'attendance.read.all',
  'attendance.read.self',
  'attendance.checkin',
  'device.unbind',
  'leaderboard.read',
];

const DIRECTOR_PERMISSIONS: Permission[] = [
  'employee.read.all',
  'attendance.read.all',
  'calls.read.all',
  'plan.manage',
  'plan.read.all',
  'payroll.read.all',
  'payroll.manage',
  'offer.read.all',
  'analytics.company',
  'analytics.department',
  'leaderboard.read',
  'audit.read',
];

const SUPER_ADMIN_PERMISSIONS: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  MOP: MOP_PERMISSIONS,
  ROP: ROP_PERMISSIONS,
  HR: HR_PERMISSIONS,
  DIRECTOR: DIRECTOR_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Область видимости данных для роли — определяет, какой фильтр вешать на запрос. */
export type DataScope = 'all' | 'department' | 'self';

export function scopeFor(
  role: Role,
  domain: 'employee' | 'attendance' | 'calls' | 'plan' | 'payroll' | 'offer',
): DataScope | null {
  const order: DataScope[] = ['all', 'department', 'self'];
  for (const scope of order) {
    if (can(role, `${domain}.read.${scope}` as Permission)) return scope;
  }
  return null;
}

/**
 * Какие роли вправе выдавать обладатель роли. Правило отдельное от
 * `account.role.assign`, потому что права мало: ЧР должен заводить людей,
 * но не должен уметь сделать супер-админа — ни другому, ни себе.
 *
 * Список пустой означает, что роль вообще не заводит сотрудников.
 */
export const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
  MOP: [],
  ROP: [],
  // ЧР работает только с линейным персоналом отделов продаж.
  HR: ['MOP', 'ROP'],
  DIRECTOR: [],
  SUPER_ADMIN: [...ROLES],
};

export function canAssignRole(actor: Role, target: Role): boolean {
  return ASSIGNABLE_ROLES[actor].includes(target);
}

/**
 * Можно ли управлять сотрудником с такой ролью: менять данные, увольнять.
 * Опирается на тот же список, поэтому ЧР не уволит директора.
 */
export function canManageEmployee(actor: Role, target: Role): boolean {
  return canAssignRole(actor, target);
}
