/**
 * Уведомления внутри системы.
 *
 * Часть событий никого не зовёт: заявка на перепривязку телефона висит,
 * пока ЧР случайно не откроет нужный экран, а сотрудник не знает, что
 * расчёт за месяц готов. Почту и пуши сюда не тянем — для этого нужны
 * внешние службы и согласия, а список в панели решает ту же задачу.
 */
export const NOTIFICATION_KINDS = [
  'device_rebind_requested',
  'device_rebind_approved',
  'device_rebind_rejected',
  'payroll_ready',
  'plan_at_risk',
  'day_not_counted',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Заголовки: короткие, читаются списком и должны различаться с одного взгляда. */
export const NOTIFICATION_TITLES: Record<NotificationKind, string> = {
  device_rebind_requested: 'Заявка на смену телефона',
  device_rebind_approved: 'Телефон перепривязан',
  device_rebind_rejected: 'Смена телефона отклонена',
  payroll_ready: 'Расчёт за месяц готов',
  plan_at_risk: 'План под угрозой',
  day_not_counted: 'День не засчитан',
};

/**
 * Насколько срочно.
 *
 * Заявка на перепривязку блокирует человеку вход, поэтому она требует
 * действия; остальное — к сведению.
 */
export const NOTIFICATION_NEEDS_ACTION: Record<NotificationKind, boolean> = {
  device_rebind_requested: true,
  device_rebind_approved: false,
  device_rebind_rejected: false,
  payroll_ready: false,
  plan_at_risk: true,
  day_not_counted: false,
};
