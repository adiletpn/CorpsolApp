/**
 * Имена коллекций и правила построения идентификаторов документов.
 *
 * В Firestore нет уникальных индексов, поэтому каждое ограничение
 * уникальности выражается через детерминированный ID документа: если
 * ключ уже занят, создание падает, и второй записи просто не появится.
 * Все такие ID собираются здесь, чтобы правило нельзя было случайно
 * обойти, построив ключ иначе в другом месте кода.
 */
export const COLLECTIONS = {
  organizations: 'organizations',
  offices: 'offices',
  terminals: 'terminals',
  departments: 'departments',
  users: 'users',
  devices: 'devices',
  deviceRequests: 'deviceRequests',
  attendance: 'attendance',
  workSchedules: 'workSchedules',
  calls: 'calls',
  externalIdentities: 'externalIdentities',
  integrations: 'integrations',
  plans: 'plans',
  offers: 'offers',
  payrolls: 'payrolls',
  bonusRules: 'bonusRules',
  points: 'points',
  achievements: 'achievements',
  userAchievements: 'userAchievements',
  auditEvents: 'auditEvents',
  dailySummaries: 'dailySummaries',
  monthlySummaries: 'monthlySummaries',
} as const;

/** Firestore запрещает «/» в идентификаторе — он разделяет сегменты пути. */
const sanitize = (value: string): string => value.replace(/\//g, '_');

/**
 * Привязка устройства. ID — сам идентификатор телефона, поэтому
 * «один телефон принадлежит одному сотруднику» держится на уровне базы:
 * второй аккаунт не сможет создать документ с тем же ключом.
 */
export const deviceDocId = (deviceId: string): string => sanitize(deviceId);

/**
 * Отметка посещаемости. ID склеен из сотрудника и календарной даты смены,
 * поэтому повторный скан за тот же день не создаст вторую запись.
 */
export const attendanceDocId = (userId: string, workDate: string): string =>
  `${sanitize(userId)}_${workDate}`;

/**
 * Импортированный звонок. Ключ — источник и его внутренний идентификатор,
 * поэтому повторная загрузка той же выгрузки Kcell или Bitrix не плодит дубли.
 */
export const callDocId = (source: string, externalId: string): string =>
  `${source}_${sanitize(externalId)}`;

/** Расчётный лист за период: один сотрудник — один документ на месяц. */
export const payrollDocId = (userId: string, periodStart: string): string =>
  `${sanitize(userId)}_${periodStart}`;

/**
 * Начисление очков. В ключ входит причина и объект, за который начислено,
 * поэтому повторная обработка того же события не начислит очки дважды.
 */
export const pointsDocId = (
  userId: string,
  reason: string,
  refType: string,
  refId: string,
): string => `${sanitize(userId)}_${reason}_${refType}_${sanitize(refId)}`;

/** Полученная ачивка выдаётся один раз. */
export const userAchievementDocId = (userId: string, achievementCode: string): string =>
  `${sanitize(userId)}_${achievementCode}`;

/** Сопоставление сотрудника с его идентификатором в Bitrix или Kcell. */
export const externalIdentityDocId = (provider: string, externalKey: string): string =>
  `${provider}_${sanitize(externalKey)}`;

/** Предагрегат за день — читается дашбордами вместо перебора отметок и звонков. */
export const dailySummaryDocId = (userId: string, date: string): string =>
  `${sanitize(userId)}_${date}`;

/** Предагрегат за месяц по отделу. */
export const monthlySummaryDocId = (departmentId: string, month: string): string =>
  `${sanitize(departmentId)}_${month}`;
