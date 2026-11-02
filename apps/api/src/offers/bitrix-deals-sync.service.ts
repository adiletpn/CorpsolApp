import { Injectable, Logger } from '@nestjs/common';

import { BitrixClient } from '../calls/bitrix-client';
import { IntegrationsService } from '../calls/integrations.service';
import { almatyMonthStart } from '../calls/pbx-sync.service';
import { mapBitrixDeals } from './bitrix-deals';
import { DealsImportService, type DealsImportSummary } from './deals-import.service';

export interface DealsSyncResult extends DealsImportSummary {
  /** Сделок получено от портала. */
  fetched: number;
  /** Без ответственного или даты — разложить не удалось. */
  rejected: number;
  /** Выгружено не всё: упёрлись в предел страниц. */
  truncated: boolean;
}

/** Отступ от прошлой точки: сделка доезжает до выборки не мгновенно. */
const OVERLAP_MS = 30 * 60 * 1000;

/**
 * Добор сделок из Bitrix24. Первый раз — с начала месяца, чтобы ранги
 * и недельные бонусы сразу считались по всему месяцу; дальше — с точки
 * прошлого добора по дате изменения сделки.
 */
@Injectable()
export class BitrixDealsSyncService {
  private readonly logger = new Logger(BitrixDealsSyncService.name);

  constructor(
    private readonly client: BitrixClient,
    private readonly integrations: IntegrationsService,
    private readonly importer: DealsImportService,
  ) {}

  async sync(organizationId: string, now = new Date(), since?: Date): Promise<DealsSyncResult> {
    const webhookUrl = await this.integrations.requireWebhook(organizationId);
    const integration = await this.integrations.find(organizationId, 'BITRIX');
    const previous = integration?.deals?.syncedUpTo?.toDate();
    const from = since ?? (previous ? new Date(previous.getTime() - OVERLAP_MS) : almatyMonthStart(now));

    try {
      const { records, truncated } = await this.client.fetchDeals(webhookUrl, from);
      const { deals, rejected } = mapBitrixDeals(records);
      const summary = await this.importer.importDeals(organizationId, deals);

      // Неполная выгрузка — до последней полученной сделки: портал отдаёт
      // их по дате изменения, и следующий прогон продолжит с этого места.
      // Стоять на месте нельзя — за месяц в портале бывает больше сделок,
      // чем входит в один прогон, и добор не закончился бы никогда.
      await this.integrations.recordDealsSync(organizationId, 'OK', {
        syncedUpTo: truncated ? this.lastModified(records) : now,
      });
      return { ...summary, fetched: records.length, rejected: rejected.length, truncated };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Неизвестная ошибка';
      await this.integrations.recordDealsSync(organizationId, 'ERROR', { error: message });
      this.logger.error(`Сделки Bitrix24 не добраны для ${organizationId}: ${message}`);
      throw cause;
    }
  }

  private lastModified(records: Array<{ DATE_MODIFY?: string | null }>): Date | undefined {
    const times = records
      .map((record) => (record.DATE_MODIFY ? new Date(record.DATE_MODIFY).getTime() : NaN))
      .filter((time) => !Number.isNaN(time));
    return times.length > 0 ? new Date(Math.max(...times)) : undefined;
  }
}
