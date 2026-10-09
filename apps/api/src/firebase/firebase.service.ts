import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

import { buildFirebaseOptions, usesEmulator } from './firebase-options';

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
    this.app = getApps()[0] ?? initializeApp(buildFirebaseOptions(this.config));

    this.firestoreInstance = getFirestore(this.app);
    this.firestoreInstance.settings({ ignoreUndefinedProperties: true });

    this.authInstance = getAuth(this.app);

    if (usesEmulator()) {
      this.logger.warn('Firebase работает через эмуляторы — это режим разработки');
    }
  }

  get firestore(): Firestore {
    return this.firestoreInstance;
  }

  get auth(): Auth {
    return this.authInstance;
  }


}
