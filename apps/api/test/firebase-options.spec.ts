import { generateKeyPairSync } from 'node:crypto';

import {
  MissingFirebaseCredentials,
  buildFirebaseOptions,
  restoreNewlines,
  usesEmulator,
} from '../src/firebase/firebase-options';

const reader = (values: Record<string, string | undefined>) => ({
  get: (key: string) => values[key],
});

const EMULATOR_ENV = { FIRESTORE_EMULATOR_HOST: 'localhost:8080' } as NodeJS.ProcessEnv;
const CLOUD_ENV = {} as NodeJS.ProcessEnv;

/** Ключ в .env лежит одной строкой с экранированными переводами. */
const ESCAPED_KEY = '-----BEGIN PRIVATE KEY-----\\nMIIEv\\n-----END PRIVATE KEY-----\\n';

describe('ключ сервисного аккаунта', () => {
  it('экранированные переводы строк восстанавливаются', () => {
    const restored = restoreNewlines(ESCAPED_KEY);

    // Без этого Admin SDK молча не проходит подпись, и видно это
    // только на боевом проекте.
    expect(restored).toContain('-----BEGIN PRIVATE KEY-----\n');
    expect(restored).not.toContain('\\n');
  });

  it('настоящие переводы строк не портятся', () => {
    const real = '-----BEGIN PRIVATE KEY-----\nMIIEv\n-----END PRIVATE KEY-----\n';

    expect(restoreNewlines(real)).toBe(real);
  });
});

describe('режим эмуляторов', () => {
  it('хост Firestore включает режим разработки', () => {
    expect(usesEmulator({ FIRESTORE_EMULATOR_HOST: 'localhost:8080' })).toBe(true);
  });

  it('хост Auth тоже включает', () => {
    expect(usesEmulator({ FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' })).toBe(true);
  });

  it('без хостов режим боевой', () => {
    expect(usesEmulator({})).toBe(false);
  });
});

describe('настройки подключения: эмуляторы', () => {
  it('сервисный ключ не требуется — подпись не проверяется', () => {
    const options = buildFirebaseOptions(reader({}), EMULATOR_ENV);

    expect(options).toEqual({ projectId: 'corpsol-local' });
  });

  it('заданный проект важнее запасного имени', () => {
    const options = buildFirebaseOptions(
      reader({ FIREBASE_PROJECT_ID: 'corpsol-test' }),
      EMULATOR_ENV,
    );

    expect(options).toEqual({ projectId: 'corpsol-test' });
  });
});

describe('настройки подключения: облако', () => {
  // Настоящий одноразовый ключ: cert() разбирает его по-настоящему,
  // и выдуманная строка проверку не прошла бы.
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const full = {
    FIREBASE_PROJECT_ID: 'corpsol-prod',
    FIREBASE_CLIENT_EMAIL: 'sa@corpsol-prod.iam.gserviceaccount.com',
    // Как в .env: одной строкой с экранированными переводами.
    FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
  };

  it('без ключа подниматься нельзя — ошибка понятная', () => {
    expect(() =>
      buildFirebaseOptions(
        reader({ ...full, FIREBASE_PRIVATE_KEY: undefined }),
        CLOUD_ENV,
      ),
    ).toThrow(MissingFirebaseCredentials);
  });

  it('без адреса сервисного аккаунта тоже', () => {
    expect(() =>
      buildFirebaseOptions(
        reader({ ...full, FIREBASE_CLIENT_EMAIL: undefined }),
        CLOUD_ENV,
      ),
    ).toThrow(MissingFirebaseCredentials);
  });

  it('в сообщении названа недостающая переменная', () => {
    expect(() =>
      buildFirebaseOptions(reader({ ...full, FIREBASE_PROJECT_ID: '' }), CLOUD_ENV),
    ).toThrow(/FIREBASE_PROJECT_ID/);
  });

  it('полный набор даёт учётные данные, а не голый проект', () => {
    const options = buildFirebaseOptions(reader(full), CLOUD_ENV);

    expect(options.credential).toBeDefined();
    expect(options).not.toHaveProperty('projectId');
  });
});
