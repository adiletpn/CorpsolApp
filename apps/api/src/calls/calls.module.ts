import { Module } from '@nestjs/common';

import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallsImportService } from './calls-import.service';
import { WorkNumbersService } from './work-numbers.service';
import { IntegrationsService } from './integrations.service';
import { BitrixClient } from './bitrix-client';
import { CallsSyncScheduler } from './calls-sync.scheduler';
import { BitrixSyncService } from './bitrix-sync.service';

@Module({
  controllers: [CallsController],
  providers: [CallsService, CallsImportService, WorkNumbersService, IntegrationsService, BitrixClient, BitrixSyncService, CallsSyncScheduler],
  exports: [CallsService, CallsImportService, BitrixSyncService],
})
export class CallsModule {}
