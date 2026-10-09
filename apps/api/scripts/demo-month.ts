/**
 * Наполняет месяц работой для демонстрации: отметки, сделки, баллы и расчёт
 * зарплаты. Сид создаёт только справочники и сотрудников, поэтому экраны
 * приложения без этого скрипта пустые.
 *
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   npx ts-node scripts/demo-month.ts
 */
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

import {
  COLLECTIONS,
  attendanceDocId,
  payrollDocId,
  planDocId,
  pointsDocId,
  userAchievementDocId,
} from '../src/firestore/collections';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Скрипт только для эмулятора: задайте FIRESTORE_EMULATOR_HOST.');
  process.exit(1);
}

const db = getFirestore(
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'corpsol-local' }),
);

const ORG = 'demo-org';
const OFFICE = 'demo-office';
const DEPARTMENT = 'demo-department';
const TERMINAL = 'demo-terminal';

const pad = (value: number): string => String(value).padStart(2, '0');
const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Будни с начала месяца по вчерашний день — за сегодня отмечается сам. */
function workdaysSoFar(): Date[] {
  const now = new Date();
  const days: Date[] = [];

  for (let day = 1; day < now.getDate(); day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) days.push(date);
  }

  return days;
}

interface Manager {
  uid: string;
  email: string;
  /** Доля опозданий: у кого-то месяц ровный, у кого-то нет. */
  lateEvery: number;
  offers: number;
}

async function managers(): Promise<Manager[]> {
  const snapshot = await db
    .collection(COLLECTIONS.users)
    .where('organizationId', '==', ORG)
    .where('role', '==', 'MOP')
    .get();

  return snapshot.docs
    .map((doc) => ({ uid: doc.id, email: (doc.data() as { email: string }).email }))
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((person, index) => ({
      ...person,
      lateEvery: [5, 3, 8][index % 3],
      offers: [7, 4, 9][index % 3],
    }));
}

/** Отметки прихода за прошедшие будни. */
async function seedAttendance(person: Manager, days: Date[]): Promise<number> {
  const batch = db.batch();
  let lateCount = 0;

  days.forEach((day, index) => {
    const isLate = index > 0 && index % person.lateEvery === 0;
    // Один прогул за месяц, чтобы было видно, как выглядит пропуск.
    const isAbsent = index === Math.floor(days.length / 2);

    const lateMinutes = isLate ? 10 + (index % 4) * 5 : 0;
    const checkIn = new Date(day);
    checkIn.setHours(9, lateMinutes + (isLate ? 5 : 0), 0, 0);

    const checkOut = new Date(day);
    checkOut.setHours(18, 5, 0, 0);

    if (isLate) lateCount += 1;

    const workDate = dateKey(day);
    batch.set(db.collection(COLLECTIONS.attendance).doc(attendanceDocId(person.uid, workDate)), {
      userId: person.uid,
      organizationId: ORG,
      departmentId: DEPARTMENT,
      officeId: OFFICE,
      terminalId: isAbsent ? null : TERMINAL,
      workDate,
      checkInAt: isAbsent ? null : Timestamp.fromDate(checkIn),
      checkOutAt: isAbsent ? null : Timestamp.fromDate(checkOut),
      status: isAbsent ? 'ABSENT' : isLate ? 'LATE' : 'ON_TIME',
      lateMinutes: isAbsent ? 0 : lateMinutes,
      method: isAbsent ? 'AUTO_ABSENCE' : 'QR',
      lat: isAbsent ? null : 43.238949,
      lng: isAbsent ? null : 76.889709,
      accuracyMeters: isAbsent ? null : 12,
      distanceMeters: isAbsent ? null : 18,
      wifiBssid: null,
      isMocked: false,
      adjustedBy: null,
      adjustNote: null,
      createdAt: Timestamp.fromDate(checkIn),
    });

    if (isAbsent) return;

    // Баллы: вовремя — плюс, опоздание — минус. Из них складывается рейтинг.
    const reason = isLate ? 'LATE_PENALTY' : 'CHECK_IN_ON_TIME';
    const refId = attendanceDocId(person.uid, workDate);
    batch.set(
      db.collection(COLLECTIONS.points).doc(pointsDocId(person.uid, reason, 'Attendance', refId)),
      {
        userId: person.uid,
        reason,
        points: isLate ? -5 : 10,
        refType: 'Attendance',
        refId,
        comment: null,
        createdAt: Timestamp.fromDate(checkIn),
      },
    );
  });

  await batch.commit();
  return lateCount;
}

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

/** Отправленные офферы: часть принята, часть в работе, часть отклонена. */
async function seedOffers(person: Manager, days: Date[]): Promise<number> {
  const batch = db.batch();
  let acceptedSum = 0;

  for (let index = 0; index < person.offers; index += 1) {
    const day = days[Math.min(index * 2, days.length - 1)] ?? days[0];
    const sentAt = new Date(day);
    sentAt.setHours(14, 0, 0, 0);

    const status = index % 3 === 0 ? 'ACCEPTED' : index % 3 === 1 ? 'SENT' : 'REJECTED';
    const amountMinor = (120000 + index * 45000) * 100;
    if (status === 'ACCEPTED') acceptedSum += amountMinor;

    const ref = db.collection(COLLECTIONS.offers).doc();
    batch.set(ref, {
      userId: person.uid,
      organizationId: ORG,
      departmentId: DEPARTMENT,
      clientName: CLIENTS[(index + person.offers) % CLIENTS.length],
      clientPhone: `+7 70${index % 8} ${100 + index} ${10 + index} ${20 + index}`,
      amountMinor,
      status,
      sentAt: Timestamp.fromDate(sentAt),
      sentDate: dateKey(day),
      resolvedAt: status === 'SENT' ? null : Timestamp.fromDate(sentAt),
    });

    if (status === 'ACCEPTED') {
      batch.set(
        db
          .collection(COLLECTIONS.points)
          .doc(pointsDocId(person.uid, 'OFFER_ACCEPTED', 'Offer', ref.id)),
        {
          userId: person.uid,
          reason: 'OFFER_ACCEPTED',
          points: 25,
          refType: 'Offer',
          refId: ref.id,
          comment: null,
          createdAt: Timestamp.fromDate(sentAt),
        },
      );
    }
  }

  await batch.commit();
  return acceptedSum;
}

/** Расчёт зарплаты за месяц: оклад, бонус за сделки, удержание за опоздания. */
async function seedPayroll(
  person: Manager,
  lateCount: number,
  acceptedSum: number,
): Promise<void> {
  const now = new Date();
  const periodStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const baseSalaryMinor = 30000000;
  // Пять процентов от принятых сделок.
  const bonusMinor = Math.round(acceptedSum * 0.05);
  const penaltyMinor = lateCount * 200000;

  await db
    .collection(COLLECTIONS.payrolls)
    .doc(payrollDocId(person.uid, periodStart))
    .set({
      userId: person.uid,
      organizationId: ORG,
      departmentId: DEPARTMENT,
      periodStart,
      periodEnd,
      baseSalaryMinor,
      bonusMinor,
      penaltyMinor,
      totalMinor: baseSalaryMinor + bonusMinor - penaltyMinor,
      lines: [
        { ruleId: 'base', kind: 'BASE', title: 'Оклад за месяц', amountMinor: baseSalaryMinor },
        {
          ruleId: 'offers',
          kind: 'BONUS',
          title: 'Бонус 5% с принятых сделок',
          amountMinor: bonusMinor,
        },
        {
          ruleId: 'late',
          kind: 'PENALTY',
          title: `Удержание за опоздания (${lateCount})`,
          amountMinor: -penaltyMinor,
        },
      ],
      status: 'APPROVED',
      calculatedAt: Timestamp.now(),
      approvedBy: null,
      approvedAt: Timestamp.now(),
    });
}

/** Выданные достижения: часть получена, часть остаётся целью. */
async function seedAchievements(person: Manager, lateCount: number): Promise<void> {
  const earned = ['PUNCTUAL_WEEK'];
  // «План закрыт» достаётся только тем, у кого месяц без срывов.
  if (lateCount <= 2) earned.push('PLAN_CRUSHER');

  const batch = db.batch();
  for (const code of earned) {
    batch.set(
      db.collection(COLLECTIONS.userAchievements).doc(userAchievementDocId(person.uid, code)),
      { userId: person.uid, achievementCode: code, unlockedAt: Timestamp.now() },
    );
  }
  await batch.commit();
}

/** Звонки менеджера за прошедшие будни. */
async function seedCalls(person: Manager, days: Date[]): Promise<number> {
  const batch = db.batch();
  let talkMinutes = 0;

  days.forEach((day, dayIndex) => {
    // Разное число звонков по дням — ровный график выглядел бы подделкой.
    const perDay = 8 + ((dayIndex * 3 + person.offers) % 7);

    for (let i = 0; i < perDay; i += 1) {
      const startedAt = new Date(day);
      startedAt.setHours(10 + Math.floor(i / 2), (i % 2) * 25 + 5, 0, 0);

      // Примерно каждый четвёртый звонок остаётся без ответа.
      const answered = (dayIndex + i) % 4 !== 0;
      const talkSeconds = answered ? 60 + ((i * 37) % 420) : 0;
      if (answered) talkMinutes += talkSeconds / 60;

      batch.set(db.collection(COLLECTIONS.calls).doc(), {
        userId: person.uid,
        organizationId: ORG,
        departmentId: DEPARTMENT,
        source: 'KCELL',
        direction: i % 5 === 0 ? 'INBOUND' : 'OUTBOUND',
        status: answered ? 'ANSWERED' : 'NO_ANSWER',
        clientPhone: `+7 70${i % 8} ${200 + i} ${30 + dayIndex} ${40 + i}`,
        startedAt: Timestamp.fromDate(startedAt),
        callDate: dateKey(day),
        durationSeconds: talkSeconds + 14,
        talkSeconds,
      });
    }
  });

  await batch.commit();
  return Math.floor(talkMinutes);
}

/** Планы на месяц: один на отдел, один личный на каждого. */
async function seedPlans(people: Manager[]): Promise<void> {
  const now = new Date();
  const periodStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodEnd = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const batch = db.batch();

  const put = (
    scope: 'DEPARTMENT' | 'USER',
    ownerId: string,
    metric: 'CALLS' | 'TALK_MINUTES' | 'OFFERS' | 'REVENUE',
    target: number,
  ) => {
    batch.set(
      db.collection(COLLECTIONS.plans).doc(planDocId(scope, ownerId, metric, periodStart)),
      {
        scope,
        organizationId: ORG,
        ownerId,
        metric,
        target,
        periodStart,
        periodEnd,
        createdBy: 'demo',
        createdAt: Timestamp.now(),
      },
    );
  };

  put('DEPARTMENT', DEPARTMENT, 'CALLS', 900);
  put('DEPARTMENT', DEPARTMENT, 'OFFERS', 40);
  put('DEPARTMENT', DEPARTMENT, 'REVENUE', 500000000);

  for (const person of people) {
    put('USER', person.uid, 'CALLS', 300);
    put('USER', person.uid, 'OFFERS', 12);
  }

  await batch.commit();
}

async function main(): Promise<void> {
  const days = workdaysSoFar();
  if (days.length === 0) {
    console.log('Сегодня первое число — прошедших будней нет, наполнять нечего.');
    return;
  }

  const people = await managers();
  if (people.length === 0) {
    console.error('Менеджеры не найдены. Сначала запустите сид.');
    process.exit(1);
  }

  for (const person of people) {
    const lateCount = await seedAttendance(person, days);
    const acceptedSum = await seedOffers(person, days);
    await seedPayroll(person, lateCount, acceptedSum);
    await seedAchievements(person, lateCount);
    const talkMinutes = await seedCalls(person, days);

    console.log(
      `${person.email}: смен ${days.length}, опозданий ${lateCount}, ` +
        `принято сделок на ${Math.round(acceptedSum / 100).toLocaleString('ru-RU')} ₸, ` +
        `разговоров ${talkMinutes} мин`,
    );
  }

  await seedPlans(people);

  console.log('Месяц наполнен.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
