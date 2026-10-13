import type { Auth } from 'firebase-admin/auth';
import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

import { COLLECTIONS } from '../firestore/collections';

export interface BootstrapInput {
  organizationName: string;
  timezone: string;
  adminEmail: string;
  adminName: string;
  /** Задан оператором. Пусто — придумаем стойкий и покажем один раз. */
  adminPassword?: string;
}

export interface BootstrapResult {
  organizationId: string;
  uid: string;
  /** Показывается один раз. Пусто, если пароль задал оператор или учётка уже была. */
  generatedPassword: string | null;
  /** Учётка с таким адресом уже существовала — пароль у неё прежний. */
  reusedAccount: boolean;
}

/** Пустой проект разворачивают один раз; поверх данных — уже не этот путь. */
export class AlreadyBootstrapped extends Error {
  constructor() {
    super('В проекте уже есть организация');
    this.name = 'AlreadyBootstrapped';
  }
}

/**
 * Пароль из букв, цифр и знаков. Длина важнее состава, поэтому берём
 * 24 символа: такой не подберут и не запомнят — запоминать его и не нужно,
 * администратор первым делом сменит его сам.
 *
 * Похожие друг на друга символы (`l`, `I`, `O`, `0`) выброшены: пароль
 * показывается один раз и часто переписывается с экрана.
 */
export function strongPassword(): string {
  const alphabet =
    'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  return Array.from(
    randomBytes(24),
    (byte) => alphabet[byte % alphabet.length],
  ).join('');
}

/**
 * Первый запуск в пустом проекте: одна организация и один администратор.
 *
 * Сид сюда не годится — он создаёт учётки с общеизвестным паролем и против
 * облака заблокирован. Но без единственной живой учётки в панель не войти,
 * а всё остальное — офисы, отделы, графики, сотрудники — заводится уже
 * из неё.
 */
export async function bootstrapOrganization(
  db: Firestore,
  auth: Auth,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  // Скрипт разворачивает пустой проект, а не чинит работающий. В базе
  // с данными он завёл бы вторую организацию, к которой не привязан
  // никто, — такую ошибку потом искать долго.
  const existing = await db.collection(COLLECTIONS.organizations).limit(1).get();
  if (!existing.empty) throw new AlreadyBootstrapped();

  const email = input.adminEmail.trim().toLowerCase();
  const password = input.adminPassword?.trim() || strongPassword();
  const generated = !input.adminPassword?.trim();
  const now = Timestamp.now();

  const organizationRef = db.collection(COLLECTIONS.organizations).doc();
  await organizationRef.set({
    name: input.organizationName,
    timezone: input.timezone,
    createdAt: now,
  });

  // Учётка могла остаться от прерванного запуска: иначе второй заход
  // упал бы на занятой почте, так ничего и не доделав.
  const found = await auth.getUserByEmail(email).catch(() => null);
  const uid =
    found?.uid ??
    (
      await auth.createUser({
        email,
        password,
        displayName: input.adminName,
        emailVerified: true,
      })
    ).uid;

  // Роль дублируется в claims: правила Firestore читают её прямо из токена.
  await auth.setCustomUserClaims(uid, { role: 'SUPER_ADMIN' });

  await db.collection(COLLECTIONS.users).doc(uid).set({
    organizationId: organizationRef.id,
    email,
    fullName: input.adminName,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    // Администратор не стоит в табеле: смен у него нет.
    departmentId: null,
    officeId: null,
    hiredAt: now,
    terminatedAt: null,
    baseSalaryMinor: 0,
    currency: 'KZT',
    createdAt: now,
    updatedAt: now,
  });

  return {
    organizationId: organizationRef.id,
    uid,
    generatedPassword: generated && !found ? password : null,
    reusedAccount: Boolean(found),
  };
}
