import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  private app!: App;
  private firestoreInstance!: Firestore;
  private authInstance!: Auth;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Hot reload в разработке переинициализирует модуль, а Admin SDK
    // не разрешает дважды поднять приложение с тем же именем.
    this.app = getApps()[0] ?? initializeApp(this.buildOptions());

    this.firestoreInstance = getFirestore(this.app);
    this.firestoreInstance.settings({ ignoreUndefinedProperties: true });

    this.authInstance = getAuth(this.app);

    if (this.usesEmulator) {
      this.logger.warn('Firebase работает через эмуляторы — это режим разработки');
    }
  }

  get firestore(): Firestore {
    return this.firestoreInstance;
  }

  get auth(): Auth {
    return this.authInstance;
  }

  private get usesEmulator(): boolean {
    return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
  }

  private buildOptions() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');

    // Эмуляторы не проверяют подпись, поэтому сервисный ключ им не нужен.
    if (this.usesEmulator) {
      return { projectId: projectId || 'corpsol-local' };
    }

    const clientEmail = this.config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config
      .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
      // В .env ключ хранится одной строкой с экранированными переводами строк.
      .replace(/\\n/g, '\n');

    return {
      credential: cert({
        projectId: this.config.getOrThrow<string>('FIREBASE_PROJECT_ID'),
        clientEmail,
        privateKey,
      }),
    };
  }
}
