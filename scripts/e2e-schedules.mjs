import { createRequire } from 'node:module';
const require = createRequire('/Users/adlet/Desktop/AppCorpsol/apps/web/package.json');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');

const API = 'http://localhost:3001/api';
const auth = getAuth(initializeApp({ apiKey: 'demo-key', projectId: 'corpsol-local' }));
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });

const cache = {};
async function call(email, path, opts = {}) {
  if (!cache[email]) {
    const cred = await signInWithEmailAndPassword(auth, email, 'CorpSol2026!');
    cache[email] = await cred.user.getIdToken();
    await signOut(auth);
  }
  const headers = { Authorization: `Bearer ${cache[email]}`, 'Content-Type': 'application/json' };
  const res = await fetch(`${API}${path}`, { method: opts.method ?? 'GET', headers, body: opts.body && JSON.stringify(opts.body) });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const ok = (n, c, d = '') => console.log(`${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);

const mop2 = (await call('director@corpsol.kz', '/employees')).body.find(e => e.email === 'mop2@corpsol.kz');

let r = await call('admin@corpsol.kz', '/schedules');
ok('список графиков доступен', r.status === 200, `HTTP ${r.status}, графиков ${r.body?.length}`);

r = await call('admin@corpsol.kz', '/schedules', { method: 'POST', body: { userId: mop2.id, startTime: '10:00', endTime: '19:00', workdays: [1,2,3,4,5], graceMinutes: 10 } });
ok('личный график создаётся', r.status === 201 || r.status === 200, `HTTP ${r.status} ${r.body?.ownerName ?? ''}`);
const created = r.body?.id;

r = await call('admin@corpsol.kz', '/schedules', { method: 'POST', body: { userId: mop2.id, departmentId: 'demo-department', startTime: '09:00', endTime: '18:00', workdays: [1] } });
ok('нельзя указать и отдел, и сотрудника', r.status === 400, `HTTP ${r.status}`);

r = await call('admin@corpsol.kz', '/schedules', { method: 'POST', body: { startTime: '09:00', endTime: '18:00', workdays: [1] } });
ok('нельзя создать график без владельца', r.status === 400, `HTTP ${r.status}`);

r = await call('admin@corpsol.kz', '/schedules', { method: 'POST', body: { userId: mop2.id, startTime: '22:00', endTime: '06:00', workdays: [1] } });
ok('ночная смена через полночь отклоняется', r.status === 400, `HTTP ${r.status}`);

r = await call('admin@corpsol.kz', '/schedules', { method: 'POST', body: { userId: mop2.id, startTime: '09:00', endTime: '18:00', workdays: [1,1,3,2], graceMinutes: 999 } });
ok('слишком большой допуск отклоняется', r.status === 400, `HTTP ${r.status}`);

r = await call('rop@corpsol.kz', '/schedules');
ok('РОП видит графики — по ним считается опоздание', r.status === 200, `HTTP ${r.status}`);

r = await call('rop@corpsol.kz', '/schedules', { method: 'POST', body: { userId: mop2.id, startTime: '09:00', endTime: '18:00', workdays: [1] } });
ok('РОП не создаёт графики', r.status === 403, `HTTP ${r.status}`);

// личный график должен перебить отдельский при правке табеля
r = await call('rop@corpsol.kz', `/attendance/adjust/${mop2.id}`, { method: 'POST', body: { workDate: '2026-09-25', checkInAt: '2026-09-25T05:00:00Z', reason: 'Проверка приоритета графика' } });
ok('личный график имеет приоритет над отдельским', r.body?.status === 'ON_TIME', `приход 10:00 при личной смене с 10:00 → ${r.body?.status}`);

if (created) {
  r = await call('admin@corpsol.kz', `/schedules/${created}`, { method: 'DELETE' });
  ok('график удаляется', r.status === 204, `HTTP ${r.status}`);
}
process.exit(0);
