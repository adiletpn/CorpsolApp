import { createRequire } from 'node:module';
const require = createRequire('/Users/adlet/Desktop/AppCorpsol/apps/web/package.json');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');

const API = 'http://localhost:3001/api';
const auth = getAuth(initializeApp({ apiKey: 'demo-key', projectId: 'corpsol-local' }));
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });

const cache = {};
async function call(email, path, { method = 'GET', body, device } = {}) {
  if (!cache[email]) {
    const cred = await signInWithEmailAndPassword(auth, email, 'CorpSol2026!');
    cache[email] = await cred.user.getIdToken();
    await signOut(auth);
  }
  const headers = { Authorization: `Bearer ${cache[email]}`, 'Content-Type': 'application/json' };
  if (device) { headers['x-device-id'] = device; headers['x-device-platform'] = 'ios'; }
  const res = await fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const ok = (n, c, d = '') => console.log(`${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);

const mop1 = (await call('director@corpsol.kz', '/employees')).body.find(e => e.email === 'mop1@corpsol.kz');
const mop2 = (await call('director@corpsol.kz', '/employees')).body.find(e => e.email === 'mop2@corpsol.kz');

// без причины
let r = await call('rop@corpsol.kz', `/attendance/adjust/${mop1.id}`, { method: 'POST', body: { workDate: '2026-09-28', checkInAt: '2026-09-28T04:00:00Z' } });
ok('без причины отклоняется', r.status === 400, `HTTP ${r.status}`);

// приход в 09:00 Алматы = 04:00 UTC → вовремя
r = await call('rop@corpsol.kz', `/attendance/adjust/${mop1.id}`, { method: 'POST', body: { workDate: '2026-09-28', checkInAt: '2026-09-28T04:00:00Z', reason: 'Был на выезде к клиенту' } });
ok('правка засчитывает приход вовремя', r.status === 200 && r.body.status === 'ON_TIME', `${r.body?.status}`);

// приход в 11:00 Алматы = 06:00 UTC, но просим ON_TIME
r = await call('rop@corpsol.kz', `/attendance/adjust/${mop1.id}`, { method: 'POST', body: { workDate: '2026-09-25', checkInAt: '2026-09-25T06:00:00Z', status: 'ON_TIME', reason: 'Попытка скрыть опоздание' } });
ok('«вовремя» при позднем приходе не проходит', r.body?.status === 'LATE', `${r.body?.status}, опоздание ${r.body?.lateMinutes} мин`);

// РОП правит чужой отдел
r = await call('rop@corpsol.kz', `/attendance/adjust/${mop2.id}`, { method: 'POST', body: { workDate: '2026-09-28', reason: 'x' } });
ok('РОП правит свой отдел', r.status === 200 || r.status === 403, `HTTP ${r.status}`);

// РОП правит себя
const rop = (await call('director@corpsol.kz', '/employees')).body.find(e => e.email === 'rop@corpsol.kz');
r = await call('rop@corpsol.kz', `/attendance/adjust/${rop.id}`, { method: 'POST', body: { workDate: '2026-09-28', checkInAt: '2026-09-28T04:00:00Z', reason: 'себе' } });
ok('нельзя править собственный табель', r.status === 403, `HTTP ${r.status}`);

// менеджер не может править
r = await call('mop1@corpsol.kz', `/attendance/adjust/${mop2.id}`, { method: 'POST', device: 'e2e-phone-1', body: { workDate: '2026-09-28', reason: 'x' } });
ok('менеджер не правит табель', r.status === 403, `HTTP ${r.status}`);

// запись помечена ручной
r = await call('rop@corpsol.kz', '/attendance?from=2026-09-25&to=2026-09-28');
const manual = r.body?.find(a => a.workDate === '2026-09-28' && a.userId === mop1.id);
ok('запись помечена как ручная', manual?.method === 'MANUAL_ADJUSTMENT', `method=${manual?.method}`);
process.exit(0);
