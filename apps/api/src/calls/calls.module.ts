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
import { BitrixDealsSyncService } from '../offers/bitrix-deals-sync.service';
import { DealsImportService } from '../offers/deals-import.service';

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
    // Сделки CRM добираются через ту же интеграцию Bitrix, что и звонки.
    DealsImportService,
    BitrixDealsSyncService,
  ],
  exports: [CallsService, CallsImportService, BitrixSyncService],
})
export class CallsModule {}
