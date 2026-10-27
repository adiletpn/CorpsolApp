/**
 * Демо-витрина в боевой организации: показать приложение живым до того,
 * как в нём накопятся настоящие данные. Наполняет текущий месяц для
 * менеджера-витрины и четырёх вымышленных коллег по отделу (они нужны
 * рейтингу). Каждая запись помечена demo: true — режим clean убирает всё
 * разом и не задевает настоящие данные.
 *
 *   ALLOW_PRODUCTION_DEMO=yes DEMO_EMAIL=demo.mop@corpsol.kz \
 *   railway run -s @corpsol/api -- npx ts-node scripts/demo-showcase.ts fill
 *
 *   … scripts/demo-showcase.ts clean
 *
 * Ключ Firebase приходит из переменных сервиса через railway run и
 * не ложится на диск.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore, type WriteBatch } from 'firebase-admin/firestore';

import {
  COLLECTIONS,
  attendanceDocId,
  payrollDocId,
  planDocId,
  pointsDocId,
  userAchievementDocId,
} from '../src/firestore/collections';

const mode = process.argv[2];
if (mode !== 'fill' && mode !== 'clean') {
  console.error('Режим: fill или clean.');
  process.exit(1);
}

const usesEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!usesEmulator && process.env.ALLOW_PRODUCTION_DEMO !== 'yes') {
  console.error('Боевая база: подтвердите явно — ALLOW_PRODUCTION_DEMO=yes.');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? 'corpsol-local';
const db = getFirestore(
  initializeApp(
    usesEmulator || !process.env.FIREBASE_PRIVATE_KEY
      ? { projectId }
      : {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        },
  ),
);

const DEMO = { demo: true };
const DEPARTMENT = 'demo-department';

/** Вымышленные коллеги: только карточки в базе, войти под ними нельзя. */
const COLLEAGUES = [
  { id: 'demo-colleague-1', fullName: 'Айгерим Нурланова', lateEvery: 9, offers: 9, answerRate: 0.86 },
  { id: 'demo-colleague-2', fullName: 'Данияр Ахметов', lateEvery: 4, offers: 6, answerRate: 0.79 },
  { id: 'demo-colleague-3', fullName: 'Мадина Касымова', lateEvery: 6, offers: 7, answerRate: 0.82 },
  { id: 'demo-colleague-4', fullName: 'Ержан Бекетов', lateEvery: 3, offers: 4, answerRate: 0.74 },
];

const CLIENTS = [
  'ТОО «Алтын Дала»',
  'ИП Сериков',
  'ТОО «Жетысу Логистик»',
  'ИП Нурланова',
  'ТОО «Тараз Строй»',
  'ИП Абенов',
  'ТОО «Шымкент Трейд»',
  'ИП Калиева',
  'ТОО «Казпром Сервис»',
];

const pad = (value: number): string => String(value).padStart(2, '0');
const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Время по Алматы: сервер хранит моменты в UTC, а смена начинается в 09:00 местного. */
const almaty = (day: Date, hours: number, minutes: number): Date =>
  new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hours - 5, minutes));

function workdaysSoFar(now: Date): Date[] {
  const days: Date[] = [];
  for (let day = 1; day < now.getDate(); day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    if (date.getDay() !== 0 && date.getDay() !== 6) days.push(date);
  }
  return days;
}

interface Person {
  id: string;
  lateEvery: number;
  offers: number;
  answerRate: number;
  /** Витрина: день, не засчитанный по дозвонам, и звонки за сегодня. */
  showcase: boolean;
}

/** Пачки по 400 операций: в одну пачку Firestore больше 500 не берёт. */
class Writer {
  private batch: WriteBatch = db.batch();
  private size = 0;
  private pending: Promise<unknown>[] = [];

  set(collection: string, id: string | null, data: Record<string, unknown>): void {
    const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();
    this.batch.set(ref, { ...data, ...DEMO });
    this.size += 1;
    if (this.size >= 400) this.flush();
  }

  private flush(): void {
    this.pending.push(this.batch.commit());
    this.batch = db.batch();
    this.size = 0;
  }

  async done(): Promise<void> {
    if (this.size > 0) this.flush();
    await Promise.all(this.pending);
  }
}

async function organizationId(): Promise<string> {
  const snapshot = await db.collection(COLLECTIONS.organizations).get();
  if (snapshot.size !== 1) {
    throw new Error(`Ожидалась одна организация, найдено ${snapshot.size}`);
  }
  return snapshot.docs[0].id;
}

async function fill(): Promise<void> {
  const org = await organizationId();
  const email = (process.env.DEMO_EMAIL ?? 'demo.mop@corpsol.kz').toLowerCase();
  const found = await db
    .collection(COLLECTIONS.users)
    .where('organizationId', '==', org)
    .where('email', '==', email)
    .get();
  if (found.empty) throw new Error(`Менеджер ${email} не найден`);
  const showcaseId = found.docs[0].id;

  const now = new Date();
  const days = workdaysSoFar(now);
  const periodStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const w = new Writer();

  w.set(COLLECTIONS.departments, DEPARTMENT, { organizationId: org, name: 'Отдел продаж', headId: null });

  const hiredAt = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth() - 3, 1));
  for (const colleague of COLLEAGUES) {
    w.set(COLLECTIONS.users, colleague.id, {
      organizationId: org,
      email: `${colleague.id}@demo.corpsol.kz`,
      fullName: colleague.fullName,
      role: 'MOP',
      status: 'ACTIVE',
      departmentId: DEPARTMENT,
      officeId: null,
      hiredAt,
      terminatedAt: null,
      baseSalaryMinor: 30000000,
      currency: 'KZT',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  // Витрину — в демо-отдел: иначе рейтинг покажет её одну. Флаг нужен,
  // чтобы clean вернул отдел обратно.
  await db.collection(COLLECTIONS.users).doc(showcaseId).update({
    departmentId: DEPARTMENT,
    demoDepartment: true,
  });

  const people: Person[] = [
    { id: showcaseId, lateEvery: 7, offers: 8, answerRate: 0.81, showcase: true },
    ...COLLEAGUES.map((colleague) => ({ ...colleague, showcase: false })),
  ];

  for (const person of people) {
    const lateCount = attendance(w, org, person, days);
    const acceptedSum = offers(w, org, person, days);
    calls(w, org, person, days, now);
    payroll(w, org, person, periodStart, periodEnd, lateCount, acceptedSum);

    const earned = ['PUNCTUAL_WEEK', ...(lateCount <= 3 ? ['DEAL_MAKER'] : [])];
    for (const code of earned) {
      w.set(COLLECTIONS.userAchievements, userAchievementDocId(person.id, code), {
        userId: person.id,
        achievementCode: code,
        unlockedAt: Timestamp.fromDate(days[Math.min(6, days.length - 1)] ?? now),
      });
    }

    w.set(COLLECTIONS.plans, planDocId('USER', person.id, 'CALLS', periodStart), {
      scope: 'USER', organizationId: org, ownerId: person.id, metric: 'CALLS',
      target: 260, periodStart, periodEnd, createdBy: 'demo', createdAt: Timestamp.now(),
    });
    w.set(COLLECTIONS.plans, planDocId('USER', person.id, 'REVENUE', periodStart), {
      scope: 'USER', organizationId: org, ownerId: person.id, metric: 'REVENUE',
      target: 150000000, periodStart, periodEnd, createdBy: 'demo', createdAt: Timestamp.now(),
    });
  }

  for (const [metric, target] of [['CALLS', 1300], ['OFFERS', 40], ['REVENUE', 700000000]] as const) {
    w.set(COLLECTIONS.plans, planDocId('DEPARTMENT', DEPARTMENT, metric, periodStart), {
      scope: 'DEPARTMENT', organizationId: org, ownerId: DEPARTMENT, metric,
      target, periodStart, periodEnd, createdBy: 'demo', createdAt: Timestamp.now(),
    });
  }

  await w.done();
  console.log(`Витрина наполнена: ${people.length} менеджеров, ${days.length} рабочих дней.`);
}

function attendance(w: Writer, org: string, person: Person, days: Date[]): number {
  let lateCount = 0;
  // Пропуск и не засчитанный день — по одному, чтобы было видно, как они выглядят.
  const absentIndex = Math.floor(days.length / 2);
  const notCountedIndex = person.showcase ? days.length - 3 : -1;

  days.forEach((day, index) => {
    const workDate = dateKey(day);
    const docId = attendanceDocId(person.id, workDate);
    const isAbsent = index === absentIndex;
    const isLate = !isAbsent && index > 0 && index % person.lateEvery === 0;
    const lateMinutes = isLate ? 7 + (index % 4) * 5 : 0;
    const checkIn = almaty(day, 9, isLate ? 5 + lateMinutes : 40 + (index % 18));
    if (isLate) lateCount += 1;

    let status = isAbsent ? 'ABSENT' : isLate ? 'LATE' : 'ON_TIME';
    const extra: Record<string, unknown> = {};
    if (index === notCountedIndex) {
      extra.callCheck = { outbound: 22, answered: 13, rateBps: 5909, statusBefore: status, checkedAt: Timestamp.now() };
      status = 'NOT_COUNTED';
    }

    w.set(COLLECTIONS.attendance, docId, {
      userId: person.id,
      organizationId: org,
      departmentId: DEPARTMENT,
      officeId: null,
      terminalId: null,
      workDate,
      checkInAt: isAbsent ? null : Timestamp.fromDate(checkIn),
      checkOutAt: isAbsent ? null : Timestamp.fromDate(almaty(day, 18, 5 + (index % 20))),
      status,
      lateMinutes: isAbsent ? 0 : lateMinutes,
      method: isAbsent ? 'AUTO_ABSENCE' : 'QR',
      lat: null,
      lng: null,
      accuracyMeters: null,
      distanceMeters: null,
      wifiBssid: null,
      isMocked: false,
      adjustedBy: null,
      adjustNote: null,
      createdAt: Timestamp.fromDate(checkIn),
      ...extra,
    });

    if (isAbsent) return;
    const reason = isLate ? 'LATE_PENALTY' : 'CHECK_IN_ON_TIME';
    w.set(COLLECTIONS.points, pointsDocId(person.id, reason, 'Attendance', docId), {
      userId: person.id,
      reason,
      points: isLate ? -5 : 10,
      refType: 'Attendance',
      refId: docId,
      comment: null,
      createdAt: Timestamp.fromDate(checkIn),
    });
  });

  return lateCount;
}

function offers(w: Writer, org: string, person: Person, days: Date[]): number {
  let acceptedSum = 0;

  for (let index = 0; index < person.offers; index += 1) {
    const day = days[Math.min(index * 2 + (person.offers % 3), days.length - 1)];
    const sentAt = almaty(day, 14, 10 * index);
    const status = index % 3 === 1 ? 'SENT' : index % 4 === 3 ? 'REJECTED' : 'ACCEPTED';
    const amountMinor = (180000 + ((index * 73000 + person.offers * 31000) % 900000)) * 100;
    if (status === 'ACCEPTED') acceptedSum += amountMinor;

    const id = `demo-offer-${person.id}-${index}`;
    w.set(COLLECTIONS.offers, id, {
      userId: person.id,
      organizationId: org,
      departmentId: DEPARTMENT,
      clientName: CLIENTS[(index + person.offers) % CLIENTS.length],
      clientPhone: `+7 70${index % 8} ${310 + index} ${12 + index} ${40 + index}`,
      amountMinor,
      status,
      sentAt: Timestamp.fromDate(sentAt),
      sentDate: dateKey(day),
      resolvedAt: status === 'SENT' ? null : Timestamp.fromDate(sentAt),
    });

    if (status === 'ACCEPTED') {
      w.set(COLLECTIONS.points, pointsDocId(person.id, 'OFFER_ACCEPTED', 'Offer', id), {
        userId: person.id,
        reason: 'OFFER_ACCEPTED',
        points: 25,
        refType: 'Offer',
        refId: id,
        comment: null,
        createdAt: Timestamp.fromDate(sentAt),
      });
    }
  }

  return acceptedSum;
}

function calls(w: Writer, org: string, person: Person, days: Date[], now: Date): void {
  const put = (day: Date, perDay: number, answeredShare: number, salt: number) => {
    for (let i = 0; i < perDay; i += 1) {
      const answered = (i * 37 + salt) % 100 < answeredShare * 100;
      const talkSeconds = answered ? 45 + ((i * 53 + salt) % 360) : 0;
      w.set(COLLECTIONS.calls, null, {
        userId: person.id,
        organizationId: org,
        departmentId: DEPARTMENT,
        source: 'KCELL',
        externalId: `demo-${person.id}-${dateKey(day)}-${i}`,
        direction: i % 7 === 3 ? 'INBOUND' : 'OUTBOUND',
        status: answered ? 'ANSWERED' : 'NO_ANSWER',
        clientPhone: `+7 7${(i + salt) % 8}${(i * 7) % 10} ${200 + ((i * 13 + salt) % 700)} ${10 + (i % 80)} ${20 + ((i * 3) % 70)}`,
        startedAt: Timestamp.fromDate(almaty(day, 10 + Math.floor(i / 3), (i % 3) * 18 + 4)),
        callDate: dateKey(day),
        durationSeconds: talkSeconds + 12,
        talkSeconds,
        recordingUrl: null,
        importedAt: Timestamp.now(),
      });
    }
  };

  days.forEach((day, index) => {
    const notCounted = person.showcase && index === days.length - 3;
    put(day, 14 + ((index * 5 + person.offers) % 9), notCounted ? 0.58 : person.answerRate, index);
  });

  // Сегодня у витрины рабочий день в разгаре: дозвонов чуть ниже порога,
  // чтобы показать подсказку «до зачёта ещё N».
  if (person.showcase) put(now, 18, 0.7, 11);
}

function payroll(
  w: Writer,
  org: string,
  person: Person,
  periodStart: string,
  periodEnd: string,
  lateCount: number,
  acceptedSum: number,
): void {
  const baseSalaryMinor = 30000000;
  const bonusMinor = Math.round(acceptedSum * 0.05);
  const penaltyMinor = lateCount * 200000 + (person.showcase ? 500000 : 0);

  const lines = [
    { ruleId: 'demo-offers', kind: 'OFFER_BONUS', title: 'Бонус 5% с принятых сделок', amountMinor: bonusMinor },
    { ruleId: 'demo-late', kind: 'LATE_PENALTY', title: `Опоздания (${lateCount})`, amountMinor: lateCount * 200000 },
  ];
  if (person.showcase) {
    lines.push({ ruleId: 'demo-absence', kind: 'ABSENCE_PENALTY', title: 'Не засчитанный день', amountMinor: 500000 });
  }

  w.set(COLLECTIONS.payrolls, payrollDocId(person.id, periodStart), {
    userId: person.id,
    organizationId: org,
    departmentId: DEPARTMENT,
    periodStart,
    periodEnd,
    baseSalaryMinor,
    bonusMinor,
    penaltyMinor,
    totalMinor: baseSalaryMinor + bonusMinor - penaltyMinor,
    lines,
    status: 'APPROVED',
    calculatedAt: Timestamp.now(),
    approvedBy: null,
    approvedAt: Timestamp.now(),
  });
}

/** Удаляет всё помеченное demo и возвращает витрине её прежний отдел. */
async function clean(): Promise<void> {
  const org = await organizationId();
  const collections = [
    COLLECTIONS.attendance,
    COLLECTIONS.points,
    COLLECTIONS.offers,
    COLLECTIONS.calls,
    COLLECTIONS.payrolls,
    COLLECTIONS.userAchievements,
    COLLECTIONS.plans,
    COLLECTIONS.users,
    COLLECTIONS.departments,
  ];

  let removed = 0;
  for (const name of collections) {
    const snapshot = await db.collection(name).where('demo', '==', true).get();
    for (let start = 0; start < snapshot.docs.length; start += 400) {
      const batch = db.batch();
      snapshot.docs.slice(start, start + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    removed += snapshot.size;
  }

  const moved = await db
    .collection(COLLECTIONS.users)
    .where('organizationId', '==', org)
    .where('demoDepartment', '==', true)
    .get();
  for (const doc of moved.docs) {
    await doc.ref.update({ departmentId: null, demoDepartment: FieldValue.delete() });
  }

  console.log(`Витрина убрана: удалено ${removed} записей.`);
}

(mode === 'fill' ? fill() : clean())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
