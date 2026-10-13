/**
 * Первый запуск в боевом проекте: одна организация и один администратор.
 *
 *   FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=... \
 *   ORGANIZATION_NAME='Колл-центр' ADMIN_EMAIL=admin@example.kz \
 *   ADMIN_NAME='Иван Иванов' \
 *   npm run bootstrap -w @corpsol/api
 *
 * Пароль можно задать в ADMIN_PASSWORD. Если его нет, скрипт придумает
 * стойкий и напечатает один раз — больше его взять будет негде.
 */
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import {
  AlreadyBootstrapped,
  bootstrapOrganization,
} from '../src/bootstrap/organization-bootstrap';

/** Обязательная переменная: без неё дальше идти некуда. */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Не задано ${name}.`);
    process.exit(1);
  }
  return value;
}

const usesEmulator = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
);

const projectId = required('FIREBASE_PROJECT_ID');

const app = initializeApp(
  usesEmulator
    ? { projectId }
    : {
        credential: process.env.FIREBASE_PRIVATE_KEY
          ? cert({
              projectId,
              clientEmail: required('FIREBASE_CLIENT_EMAIL'),
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
          : // В Cloud Run и подобных средах ключ подкладывает сама платформа.
            applicationDefault(),
        projectId,
      },
);

async function main(): Promise<void> {
  const organizationName = required('ORGANIZATION_NAME');
  const adminEmail = required('ADMIN_EMAIL');
  const adminName = required('ADMIN_NAME');

  const result = await bootstrapOrganization(getFirestore(app), getAuth(app), {
    organizationName,
    timezone: process.env.ORGANIZATION_TIMEZONE?.trim() || 'Asia/Almaty',
    adminEmail,
    adminName,
    adminPassword: process.env.ADMIN_PASSWORD,
  });

  console.log(`Организация «${organizationName}» создана: ${result.organizationId}`);
  console.log(`Администратор: ${adminEmail.toLowerCase()}`);

  if (result.reusedAccount) {
    console.log('Учётка с таким адресом уже была — пароль остался прежним.');
  } else if (result.generatedPassword) {
    console.log(`Пароль (показан один раз): ${result.generatedPassword}`);
  }

  console.log('\nДальше из панели: офис с координатами, терминал, отделы,');
  console.log('графики и сотрудники.');
}

main()
  .then(() => process.exit(0))
  .catch((cause) => {
    if (cause instanceof AlreadyBootstrapped) {
      console.error(
        'В проекте уже есть организация. Этот скрипт только для пустого проекта:\n' +
          'сотрудники, офисы и отделы заводятся из панели.',
      );
      process.exit(1);
    }

    console.error(cause);
    process.exit(1);
  });
