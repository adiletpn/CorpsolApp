import { createRequire } from 'node:module';
const require = createRequire('/Users/adlet/Desktop/AppCorpsol/apps/web/package.json');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');

const API = 'http://localhost:3001/api';
const app = initializeApp({ apiKey: 'demo-key', projectId: 'corpsol-local' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });

const tokens = {};
async function token(email, password = 'CorpSol2026!') {
  if (tokens[email]) return tokens[email];
  const cred = await signInWithEmailAndPassword(auth, email, password);
  tokens[email] = await cred.user.getIdToken();
  await signOut(auth);
  return tokens[email];
}

async function call(email, path, { method = 'GET', body, device } = {}) {
  const headers = { Authorization: `Bearer ${await token(email)}`, 'Content-Type': 'application/json' };
  if (device) {
    headers['x-device-id'] = device;
    headers['x-device-platform'] = 'ios';
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const month = { from: '2026-09-01', to: '2026-09-30' };

// ── ЧР заводит сотрудника ────────────────────────────────────────────────
const email = `e2e-${Date.now()}@corpsol.kz`;
const created = await call('hr@corpsol.kz', '/employees', {
  method: 'POST',
  body: { email, fullName: 'Тестовый Менеджер', role: 'MOP', departmentId: 'demo-department', officeId: 'demo-office', baseSalaryMinor: 30_000_000 },
});
check('ЧР заводит менеджера', created.status === 201 || created.status === 200, `HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 120)}`);
const newUserId = created.body?.id;
const tempPassword = created.body?.temporaryPassword;

// ── ЧР не может завести админа ───────────────────────────────────────────
const escalation = await call('hr@corpsol.kz', '/employees', {
  method: 'POST',
  body: { email: `bad-${Date.now()}@corpsol.kz`, fullName: 'Взлом', role: 'SUPER_ADMIN' },
});
check('ЧР не может завести супер-админа', escalation.status === 403, `HTTP ${escalation.status}`);

// ── новый сотрудник входит временным паролем ─────────────────────────────
if (tempPassword) {
  try {
    await token(email, tempPassword);
    const me = await call(email, '/auth/me', { device: 'e2e-new-phone' });
    check('новый сотрудник входит временным паролем', me.status === 200, `роль ${me.body?.role}`);
  } catch (error) {
    check('новый сотрудник входит временным паролем', false, error.message);
  }
}

// ── директор ставит планы ────────────────────────────────────────────────
const deptPlan = await call('director@corpsol.kz', '/plans', {
  method: 'POST',
  body: { scope: 'DEPARTMENT', ownerId: 'demo-department', metric: 'OFFERS', target: 5, periodStart: month.from, periodEnd: month.to },
});
check('директор ставит план отделу', deptPlan.status === 201 || deptPlan.status === 200, `HTTP ${deptPlan.status}`);

const mop1 = (await call('director@corpsol.kz', '/employees')).body?.find((e) => e.email === 'mop1@corpsol.kz');
const userPlan = await call('director@corpsol.kz', '/plans', {
  method: 'POST',
  body: { scope: 'USER', ownerId: mop1?.id, metric: 'OFFERS', target: 2, periodStart: month.from, periodEnd: month.to },
});
check('директор ставит личный план', userPlan.status === 201 || userPlan.status === 200, `HTTP ${userPlan.status}`);

// ── РОП не может ставить планы ───────────────────────────────────────────
const ropPlan = await call('rop@corpsol.kz', '/plans', {
  method: 'POST',
  body: { scope: 'USER', ownerId: mop1?.id, metric: 'CALLS', target: 10, periodStart: month.from, periodEnd: month.to },
});
check('РОП не ставит планы', ropPlan.status === 403, `HTTP ${ropPlan.status}`);

// ── менеджер создаёт сделки ──────────────────────────────────────────────
const offers = [];
for (let i = 0; i < 3; i += 1) {
  const offer = await call('mop1@corpsol.kz', '/offers', {
    method: 'POST',
    device: 'e2e-phone-1',
    body: { clientName: `Клиент ${i + 1}`, clientPhone: '87071112233', amountMinor: 50_000_000 },
  });
  offers.push(offer);
}
check('менеджер создаёт сделки', offers.every((o) => o.status === 201 || o.status === 200), `HTTP ${offers.map((o) => o.status).join(',')}`);

// ── менеджер НЕ может подтвердить свою сделку ────────────────────────────
const selfConfirm = await call('mop1@corpsol.kz', `/offers/${offers[0].body?.id}/resolve`, {
  method: 'POST',
  device: 'e2e-phone-1',
  body: { status: 'ACCEPTED' },
});
check('менеджер не подтверждает свою сделку', selfConfirm.status === 403, `HTTP ${selfConfirm.status}`);

// ── РОП подтверждает ─────────────────────────────────────────────────────
const confirmed = [];
for (const offer of offers) {
  const res = await call('rop@corpsol.kz', `/offers/${offer.body?.id}/resolve`, {
    method: 'POST',
    body: { status: 'ACCEPTED' },
  });
  confirmed.push(res.status);
}
check('РОП подтверждает сделки', confirmed.every((s) => s === 200 || s === 201), `HTTP ${confirmed.join(',')}`);

// ── план ожил ────────────────────────────────────────────────────────────
const plans = await call('director@corpsol.kz', `/plans?periodStart=${month.from}`);
const offersPlan = plans.body?.find((p) => p.scope === 'USER' && p.metric === 'OFFERS');
check('личный план видит подтверждённые сделки', offersPlan?.progress?.achieved === 3, `achieved=${offersPlan?.progress?.achieved} ratio=${offersPlan?.progress?.ratio}`);

const deptPlanNow = plans.body?.find((p) => p.scope === 'DEPARTMENT');
check('план отдела видит сделки', deptPlanNow?.progress?.achieved === 3, `achieved=${deptPlanNow?.progress?.achieved}`);

// ── правило премирования и расчёт ────────────────────────────────────────
const rule = await call('director@corpsol.kz', '/payroll/rules', {
  method: 'POST',
  body: { kind: 'PER_UNIT', metric: 'OFFERS', threshold: 0, amountMinor: 100_000, percentBps: 0 },
});
check('директор заводит правило премирования', rule.status === 201 || rule.status === 200, `HTTP ${rule.status}`);

const emptyRule = await call('director@corpsol.kz', '/payroll/rules', {
  method: 'POST',
  body: { kind: 'ATTENDANCE', threshold: 0, amountMinor: 0, percentBps: 0 },
});
check('правило без суммы отклоняется', emptyRule.status === 400, `HTTP ${emptyRule.status}`);

const payroll = await call('director@corpsol.kz', '/payroll/calculate', {
  method: 'POST',
  body: { userId: mop1?.id, periodStart: month.from, periodEnd: month.to },
});
check('расчёт зарплаты выполняется', payroll.status === 200 || payroll.status === 201, `HTTP ${payroll.status}`);
check('премия начислена за 3 сделки', payroll.body?.bonusMinor === 300_000, `bonus=${payroll.body?.bonusMinor} total=${payroll.body?.totalMinor}`);

// ── менеджер видит свою зарплату ─────────────────────────────────────────
const myPayroll = await call('mop1@corpsol.kz', `/payroll?periodStart=${month.from}`, { device: 'e2e-phone-1' });
check('менеджер видит свой расчёт', myPayroll.status === 200 && myPayroll.body?.length === 1, `HTTP ${myPayroll.status} записей ${myPayroll.body?.length}`);

// ── менеджер не видит чужие сделки ───────────────────────────────────────
const mop2Offers = await call('mop2@corpsol.kz', `/offers?from=${month.from}&to=${month.to}`, { device: 'e2e-phone-3' });
check('менеджер не видит чужие сделки', mop2Offers.status === 200 && mop2Offers.body?.length === 0, `записей ${mop2Offers.body?.length}`);

// ── ачивки ───────────────────────────────────────────────────────────────
const achievements = await call('director@corpsol.kz', '/gamification/achievements/evaluate', {
  method: 'POST',
  body: { userId: mop1?.id, periodStart: month.from, periodEnd: month.to },
});
check('пересчёт ачивок выполняется', achievements.status === 200, `HTTP ${achievements.status} ${JSON.stringify(achievements.body).slice(0, 100)}`);

// ── увольнение закрывает доступ ──────────────────────────────────────────
if (newUserId) {
  const fired = await call('hr@corpsol.kz', `/employees/${newUserId}/terminate`, { method: 'POST', body: {} });
  check('ЧР увольняет сотрудника', fired.status === 204, `HTTP ${fired.status}`);

  const afterFire = await call(email, '/auth/me', { device: 'e2e-new-phone' });
  check('уволенный теряет доступ', afterFire.status === 401 || afterFire.status === 403, `HTTP ${afterFire.status}`);
}

console.log(`\nИтог: ${results.filter((r) => r.ok).length} из ${results.length}`);
const failed = results.filter((r) => !r.ok);
if (failed.length) console.log('Не прошло:', failed.map((r) => r.name).join('; '));
process.exit(0);
