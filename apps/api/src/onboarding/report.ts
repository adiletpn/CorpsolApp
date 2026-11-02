import type { OnboardReport, OnboardRow } from './onboard';

const ROLE_NAMES: Record<string, string> = { MOP: 'менеджер', ROP: 'РОП', HR: 'HR', DIRECTOR: 'директор' };
const STATUS: Record<OnboardRow['status'], string> = { created: 'заведён', existing: 'уже был', failed: 'ОШИБКА' };

/** Таблица итогов — что сделано с каждым человеком и что требует рук. */
export function formatSummary(report: OnboardReport): string {
  const lines = [
    `Отдел «${report.department.name}» ${report.department.created ? 'создан' : 'уже был'}` +
      (report.head ? `, руководитель — ${report.head}` : ''),
    '',
  ];

  for (const row of report.rows) {
    const links = row.links.length > 0 ? row.links.join(', ') : 'без номеров';
    lines.push(`${STATUS[row.status].padEnd(8)} ${row.name} · ${row.email} · ${links}`);
    for (const problem of row.problems) lines.push(`         ! ${problem}`);
  }

  for (const [pbx, result] of Object.entries(report.sync)) {
    lines.push('');
    if ('error' in result) {
      lines.push(`Добор ${pbx}: не удался — ${result.error}`);
      continue;
    }
    lines.push(`Добор ${pbx}: получено ${result.fetched}, загружено ${result.imported}, без сотрудника ${result.withoutEmployee}`);
    if (result.unmatched.length > 0) {
      lines.push(`  не привязаны: ${result.unmatched.map((item) => `${item.employeeKey}=${item.count}`).join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Сообщения для рассылки: каждому — его логин и пароль. Только тем, кого
 * завели сейчас: пароль прежних сотрудников система не хранит в открытом виде.
 */
export function formatMessages(report: OnboardReport, bot: string): string {
  return report.rows
    .filter((row) => row.password)
    .map((row) => {
      const role = row.role === 'MOP' ? '' : ` (${ROLE_NAMES[row.role] ?? row.role} отдела ${report.department.name})`;
      return [
        `${row.name}, привет! Доступ в CorpSol${role}:`,
        `Логин: ${row.email}`,
        `Пароль: ${row.password}`,
        `Вход: в Telegram открой бота ${bot} → «Открыть» → введи логин и пароль. Входи со своего телефона — аккаунт закрепится за твоим Telegram.`,
      ].join('\n');
    })
    .join('\n\n');
}
