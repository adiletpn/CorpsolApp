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

const mop1 = (await call('director@corpsol.kz', '/employees')).body.find(e => e.email === 'mop1@corpsol.kz');

// свежая правка табеля за пятницу
await call('rop@corpsol.kz', `/attendance/adjust/${mop1.id}`, {
  method: 'POST',
  body: { workDate: '2026-09-25', checkInAt: '2026-09-25T06:00:00Z', reason: 'Проверка журнала' },
});

const r = await call('director@corpsol.kz', '/audit?limit=50');
ok('свежее событие попало в журнал', r.body?.length > 0, `событий ${r.body?.length}`);

const adjust = r.body?.find(e => e.action === 'attendance.adjust');
ok('видно автора', Boolean(adjust?.actor?.fullName), adjust?.actor?.fullName);
ok('видна причина', adjust?.metadata?.reason === 'Проверка журнала', String(adjust?.metadata?.reason));
ok('виден прежний статус', 'previousStatus' in (adjust?.metadata ?? {}), `было ${adjust?.metadata?.previousStatus}, стало ${adjust?.metadata?.status}`);

const sensitive = await call('director@corpsol.kz', '/audit?sensitiveOnly=true');
ok('попадает в отбор обходов контроля', sensitive.body?.some(e => e.action === 'attendance.adjust'), `событий ${sensitive.body?.length}`);
process.exit(0);
