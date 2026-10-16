import { Global, Module } from '@nestjs/common';

import { JobLockService } from './job-lock.service';

/** Замок нужен каждой фоновой задаче — держим его глобальным. */
@Global()
@Module({
  providers: [JobLockService],
  exports: [JobLockService],
})
export class JobsModule {}
