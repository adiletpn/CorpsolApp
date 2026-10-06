import { createRequire } from 'node:module';
const require = createRequire('/Users/adlet/Desktop/AppCorpsol/apps/web/package.json');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');

const API = 'http://localhost:3001/api';
const auth = getAuth(initializeApp({ apiKey: 'demo-key', projectId: 'corpsol-local' }));
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });

const cache = {};
async function call(email, path, { method = 'GET', body } = {}) {
  if (!cache[email]) {
    const cred = await signInWithEmailAndPassword(auth, email, 'CorpSol2026!');
    cache[email] = await cred.user.getIdToken();
    await signOut(auth);
  }
  const headers = { Authorization: `Bearer ${cache[email]}`, 'Content-Type': 'application/json' };
  const res = await fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const ok = (n, c, d = '') => console.log(`${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);

// Среда, заведомо в прошлом и вне дней, которые трогают другие проверки.
const DAY = '2026-09-16';

let r = await call('rop@corpsol.kz', '/attendance/mark-absences', {
  method: 'POST',
  body: { workDate: DAY },
});
ok('руководитель запускает простановку', r.status === 200, `HTTP ${r.status}`);
ok('отчёт содержит счётчики', typeof r.body?.marked === 'number', JSON.stringify(r.body));

const firstRun = r.body?.marked ?? 0;

r = await call('rop@corpsol.kz', '/attendance/mark-absences', {
  method: 'POST',
  body: { workDate: DAY },
});
ok('повторный прогон ничего не добавляет', r.body?.marked === 0, `добавлено ${r.body?.marked}`);

r = await call('rop@corpsol.kz', `/attendance?from=${DAY}&to=${DAY}`);
const auto = r.body?.filter((a) => a.method === 'AUTO_ABSENCE') ?? [];
ok('записи помечены как автоматические', auto.length === firstRun, `${auto.length} из ${firstRun}`);
ok('все они со статусом прогула', auto.every((a) => a.status === 'ABSENT'), `${auto.length} шт.`);

r = await call('mop1@corpsol.kz', '/attendance/mark-absences', {
  method: 'POST',
  body: { workDate: DAY },
});
ok('менеджер запускать не может', r.status === 403, `HTTP ${r.status}`);

r = await call('rop@corpsol.kz', '/attendance/mark-absences', {
  method: 'POST',
  body: { workDate: '16.09.2026' },
});
ok('дата в чужом формате отклоняется', r.status === 400, `HTTP ${r.status}`);

r = await call('director@corpsol.kz', '/audit?action=attendance.auto_absence');
ok('прогон виден в журнале', Array.isArray(r.body) && r.body.length > 0, `${r.body?.length} записей`);

process.exit(0);
