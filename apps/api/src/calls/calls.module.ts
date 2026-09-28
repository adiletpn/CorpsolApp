import { Module } from '@nestjs/common';

import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallsImportService } from './calls-import.service';
import { WorkNumbersService } from './work-numbers.service';

@Module({
  controllers: [CallsController],
  providers: [CallsService, CallsImportService, WorkNumbersService],
  exports: [CallsService, CallsImportService],
})
export class CallsModule {}
