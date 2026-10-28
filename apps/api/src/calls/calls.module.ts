import { Module } from '@nestjs/common';

import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallsImportService } from './calls-import.service';
import { WorkNumbersService } from './work-numbers.service';
import { IntegrationsService } from './integrations.service';
import { BitrixClient } from './bitrix-client';
import { CallsSyncScheduler } from './calls-sync.scheduler';
import { BitrixSyncService } from './bitrix-sync.service';
import { KcellApiClient } from './kcell-api-client';
import { PbxSyncService } from './pbx-sync.service';
import { SipuniApiClient } from './sipuni-api-client';

@Module({
  controllers: [CallsController],
  providers: [
    CallsService,
    CallsImportService,
    WorkNumbersService,
    IntegrationsService,
    BitrixClient,
    BitrixSyncService,
    KcellApiClient,
    SipuniApiClient,
    PbxSyncService,
    CallsSyncScheduler,
  ],
  exports: [CallsService, CallsImportService, BitrixSyncService],
})
export class CallsModule {}
