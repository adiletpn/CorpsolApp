import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { JobsModule } from '../src/common/jobs/jobs.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { GradesService } from '../src/payroll/grades.service';
import { PayrollController } from '../src/payroll/payroll.controller';
import { PayrollModule } from '../src/payroll/payroll.module';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

@Global()
@Module({
  providers: [{ provide: FirebaseService, useValue: fakeFirebase(new FakeFirestore()) }],
  exports: [FirebaseService],
})
class FakeFirebaseModule {}

describe('модуль зарплаты собирается', () => {
  it('контроллер получает расчёт, правила и ранги', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeFirebaseModule, JobsModule, NotificationsModule, PayrollModule],
    }).compile();

    expect(moduleRef.get(PayrollController)).toBeDefined();
    expect(moduleRef.get(GradesService)).toBeDefined();

    await moduleRef.close();
  });
});
