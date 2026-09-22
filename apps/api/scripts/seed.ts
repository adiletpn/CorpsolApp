/**
 * Демо-данные для разработки. Рассчитан на эмуляторы Firebase:
 *
 *   firebase emulators:start --only auth,firestore
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   npm run seed -w @corpsol/api
 *
 * Запуск против боевого проекта намеренно заблокирован ниже.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

import { COLLECTIONS } from '../src/firestore/collections';

const DEMO_PASSWORD = 'CorpSol2026!';

const usesEmulator = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
);

if (!usesEmulator && process.env.ALLOW_PRODUCTION_SEED !== 'yes') {
  console.error(
    'Сид рассчитан на эмуляторы. Он создаёт учётки с общеизвестным паролем,\n' +
      'поэтому в боевом проекте запускать его нельзя.\n' +
      'Если это осознанное решение — задайте ALLOW_PRODUCTION_SEED=yes.',
  );
  process.exit(1);
}

const app = initializeApp(
  usesEmulator
    ? { projectId: process.env.FIREBASE_PROJECT_ID ?? 'corpsol-local' }
    : {
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
        }),
      },
);

const db = getFirestore(app);
const auth = getAuth(app);

interface SeedUser {
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'DIRECTOR' | 'HR' | 'ROP' | 'MOP';
  baseSalaryMinor?: number;
  inDepartment?: boolean;
}

const PEOPLE: SeedUser[] = [
  { email: 'admin@corpsol.kz', fullName: 'Супер Админ', role: 'SUPER_ADMIN' },
  { email: 'director@corpsol.kz', fullName: 'Директор', role: 'DIRECTOR' },
  { email: 'hr@corpsol.kz', fullName: 'HR Менеджер', role: 'HR' },
  {
    email: 'rop@corpsol.kz',
    fullName: 'Руководитель отдела',
    role: 'ROP',
    baseSalaryMinor: 40_000_000,
    inDepartment: true,
  },
  ...[1, 2, 3].map((index) => ({
    email: `mop${index}@corpsol.kz`,
    fullName: `Менеджер ${index}`,
    role: 'MOP' as const,
    baseSalaryMinor: 25_000_000,
    inDepartment: true,
  })),
];

/** Учётка могла остаться от прошлого запуска — переиспользуем её. */
async function ensureAuthUser(email: string, fullName: string): Promise<string> {
  const existing = await auth.getUserByEmail(email).catch(() => null);
  if (existing) return existing.uid;

  const created = await auth.createUser({
    email,
    password: DEMO_PASSWORD,
    displayName: fullName,
    emailVerified: true,
  });
  return created.uid;
}

async function main(): Promise<void> {
  const now = Timestamp.now();

  const organizationId = 'demo-org';
  await db.collection(COLLECTIONS.organizations).doc(organizationId).set({
    name: 'CorpSol Call Center',
    timezone: 'Asia/Almaty',
    createdAt: now,
  });

  const officeId = 'demo-office';
  await db.collection(COLLECTIONS.offices).doc(officeId).set({
    organizationId,
    name: 'Головной офис',
    address: 'Алматы, пр. Достык 1',
    // Координаты офиса — заменить на реальные перед запуском.
    lat: 43.238949,
    lng: 76.889709,
    radiusMeters: 120,
    maxAccuracyMeters: 100,
    // Пустой список = проверка по Wi-Fi выключена, работает только GPS.
    wifiBssids: [],
  });

  const terminalId = 'demo-terminal';
  await db.collection(COLLECTIONS.terminals).doc(terminalId).set({
    officeId,
    name: 'Терминал у входа',
    secret: randomBytes(32).toString('base64url'),
    isActive: true,
    accessTokenHash: null,
    tokenIssuedAt: null,
    createdAt: now,
  });

  const departmentId = 'demo-department';

  const uids = new Map<string, string>();
  for (const person of PEOPLE) {
    const uid = await ensureAuthUser(person.email, person.fullName);
    uids.set(person.email, uid);

    // Роль дублируется в claims: правила безопасности Firestore читают её
    // прямо из токена, без обращения к базе.
    await auth.setCustomUserClaims(uid, { role: person.role });

    await db.collection(COLLECTIONS.users).doc(uid).set({
      organizationId,
      email: person.email,
      fullName: person.fullName,
      role: person.role,
      status: 'ACTIVE',
      departmentId: person.inDepartment ? departmentId : null,
      officeId,
      hiredAt: now,
      terminatedAt: null,
      baseSalaryMinor: person.baseSalaryMinor ?? 0,
      currency: 'KZT',
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.collection(COLLECTIONS.departments).doc(departmentId).set({
    organizationId,
    name: 'Отдел продаж №1',
    headId: uids.get('rop@corpsol.kz') ?? null,
  });

  await db.collection(COLLECTIONS.workSchedules).doc('demo-schedule').set({
    departmentId,
    userId: null,
    startTime: '09:00',
    endTime: '18:00',
    graceMinutes: 5,
    workdays: [1, 2, 3, 4, 5],
    effectiveFrom: now,
    effectiveTo: null,
  });

  const achievements = [
    { code: 'PUNCTUAL_WEEK', title: 'Неделя без опозданий', description: 'Пять смен подряд вовремя', points: 50 },
    { code: 'CALL_MACHINE', title: 'Call Machine', description: '100 разговоров за неделю', points: 80 },
    { code: 'PLAN_CRUSHER', title: 'План закрыт', description: 'Личный план выполнен на 100%', points: 120 },
  ];

  const batch = db.batch();
  for (const achievement of achievements) {
    batch.set(db.collection(COLLECTIONS.achievements).doc(achievement.code), achievement);
  }
  await batch.commit();

  console.log('Демо-данные созданы.');
  console.log(`Пароль для всех учёток: ${DEMO_PASSWORD}`);
  console.log(`Терминал: ${terminalId} (токен выпускается через API)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
