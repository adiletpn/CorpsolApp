import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'CorpSol2026!';

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  const organization = await prisma.organization.create({
    data: { name: 'CorpSol Call Center', timezone: 'Asia/Almaty' },
  });

  const office = await prisma.office.create({
    data: {
      organizationId: organization.id,
      name: 'Головной офис',
      address: 'Алматы, пр. Достык 1',
      // Координаты офиса — заменить на реальные перед запуском.
      lat: 43.238949,
      lng: 76.889709,
      radiusMeters: 120,
      maxAccuracyMeters: 100,
      // Пустой список = проверка по Wi-Fi выключена, работает только GPS.
      wifiBssids: [],
    },
  });

  await prisma.terminal.create({
    data: {
      officeId: office.id,
      name: 'Терминал у входа',
      secret: randomBytes(32).toString('base64url'),
    },
  });

  const department = await prisma.department.create({
    data: { organizationId: organization.id, name: 'Отдел продаж №1' },
  });

  const base = {
    organizationId: organization.id,
    passwordHash,
    officeId: office.id,
  };

  const admin = await prisma.user.create({
    data: { ...base, email: 'admin@corpsol.kz', fullName: 'Супер Админ', role: Role.SUPER_ADMIN },
  });

  await prisma.user.create({
    data: { ...base, email: 'director@corpsol.kz', fullName: 'Директор', role: Role.DIRECTOR },
  });

  await prisma.user.create({
    data: { ...base, email: 'hr@corpsol.kz', fullName: 'HR Менеджер', role: Role.HR },
  });

  const rop = await prisma.user.create({
    data: {
      ...base,
      email: 'rop@corpsol.kz',
      fullName: 'Руководитель отдела',
      role: Role.ROP,
      departmentId: department.id,
      baseSalaryMinor: 40_000_000,
    },
  });

  await prisma.department.update({
    where: { id: department.id },
    data: { headId: rop.id },
  });

  for (let index = 1; index <= 3; index += 1) {
    await prisma.user.create({
      data: {
        ...base,
        email: `mop${index}@corpsol.kz`,
        fullName: `Менеджер ${index}`,
        role: Role.MOP,
        departmentId: department.id,
        baseSalaryMinor: 25_000_000,
      },
    });
  }

  await prisma.workSchedule.create({
    data: {
      departmentId: department.id,
      startTime: '09:00',
      endTime: '18:00',
      graceMinutes: 5,
      workdays: [1, 2, 3, 4, 5],
    },
  });

  await prisma.achievement.createMany({
    data: [
      { code: 'PUNCTUAL_WEEK', title: 'Неделя без опозданий', description: 'Пять смен подряд вовремя', points: 50 },
      { code: 'CALL_MACHINE', title: 'Call Machine', description: '100 разговоров за неделю', points: 80 },
      { code: 'PLAN_CRUSHER', title: 'План закрыт', description: 'Личный план выполнен на 100%', points: 120 },
    ],
  });

  console.log('Демо-данные созданы.');
  console.log(`Пароль для всех учёток: ${DEMO_PASSWORD}`);
  console.log(`Супер-админ: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
