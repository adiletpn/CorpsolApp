/**
 * Завести отдел по списку — одной командой вместо десятков кликов в панели.
 *
 *   CORPSOL_API_URL=https://corpsolapi-production.up.railway.app/api \
 *   FIREBASE_WEB_API_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   npm run onboard -w @corpsol/api -- kvanta.json
 *
 * Формат файла — в src/onboarding/roster.ts и docs/onboarding.md.
 * Флаг --check только проверяет файл и ничего не меняет.
 * Повторный запуск того же файла безопасен: созданное не задваивается.
 */
import { readFileSync } from 'node:fs';

import { onboard } from '../src/onboarding/onboard';
import { PanelClient, signIn } from '../src/onboarding/panel-client';
import { formatMessages, formatSummary } from '../src/onboarding/report';
import { RosterError, parseRoster } from '../src/onboarding/roster';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Не задано ${name}.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!file) {
    console.error('Укажите файл со списком: npm run onboard -- kvanta.json');
    process.exit(1);
  }

  const roster = parseRoster(JSON.parse(readFileSync(file, 'utf8')));
  console.log(`Список в порядке: отдел «${roster.department}», людей — ${roster.employees.length}.`);
  if (args.includes('--check')) return;

  const token = await signIn(required('FIREBASE_WEB_API_KEY'), required('ADMIN_EMAIL'), required('ADMIN_PASSWORD'));
  const report = await onboard(roster, new PanelClient(required('CORPSOL_API_URL'), token));

  console.log('\n' + formatSummary(report));
  const messages = formatMessages(report, process.env.TELEGRAM_BOT_NAME?.trim() || '@CorpsolApp');
  if (messages) console.log('\n— Сообщения для рассылки —\n\n' + messages);
}

main().catch((cause: unknown) => {
  console.error(cause instanceof RosterError || cause instanceof Error ? cause.message : String(cause));
  process.exit(1);
});
