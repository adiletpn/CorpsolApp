import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { CallsController } from '../src/calls/calls.controller';
import { CallsModule } from '../src/calls/calls.module';
import { CallsSyncScheduler } from '../src/calls/calls-sync.scheduler';
import { PbxSyncService } from '../src/calls/pbx-sync.service';
import { JobsModule } from '../src/common/jobs/jobs.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

/** Firebase подменён — проверяется только сборка зависимостей модуля. */
@Global()
@Module({
  providers: [{ provide: FirebaseService, useValue: fakeFirebase(new FakeFirestore()) }],
  exports: [FirebaseService],
})
class FakeFirebaseModule {}

describe('модуль звонков собирается', () => {
  it('контроллер, расписание и синхронизация АТС получают свои зависимости', async () => {
    // Забытый провайдер всплыл бы только при запуске сервера на Railway.
    const moduleRef = await Test.createTestingModule({
      imports: [FakeFirebaseModule, JobsModule, NotificationsModule, CallsModule],
    }).compile();

    expect(moduleRef.get(CallsController)).toBeDefined();
    expect(moduleRef.get(CallsSyncScheduler)).toBeDefined();
    expect(moduleRef.get(PbxSyncService)).toBeDefined();

    await moduleRef.close();
  });
});
