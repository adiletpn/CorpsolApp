import { Injectable, Logger } from '@nestjs/common';

import { BitrixClient } from './bitrix-client';
import { mapBitrixCalls } from './bitrix-mapper';
import { CallsImportService, type ImportSummary } from './calls-import.service';
import { IntegrationsService } from './integrations.service';

export interface SyncResult extends ImportSummary {
  /** Записей получено от портала. */
  fetched: number;
  /** Записей, которые портал прислал, но разобрать не удалось. */
  rejected: number;
  /** Выгружено не всё: упёрлись в предел страниц. */
  truncated: boolean;
}

/**
 * Насколько назад отступаем от точки прошлой синхронизации.
 *
 * Звонок попадает в статистику портала не мгновенно, и запрос строго
 * «после последнего загруженного» терял бы записи, доехавшие с задержкой.
 * Перекрытие безопасно: повторные звонки отсекаются по ключу идемпотентности.
 */
const OVERLAP_MINUTES = 30;

@Injectable()
export class BitrixSyncService {
  private readonly logger = new Logger(BitrixSyncService.name);

  constructor(
    private readonly client: BitrixClient,
    private readonly integrations: IntegrationsService,
    private readonly importer: CallsImportService,
  ) {}

  /**
   * Доборная синхронизация звонков из Bitrix24.
   *
   * Сопоставление идёт по идентификатору пользователя портала, поэтому
   * до первого запуска нужно завести соответствия в разделе рабочих номеров.
   */
  async sync(organizationId: string, since?: Date): Promise<SyncResult> {
    const webhookUrl = await this.integrations.requireWebhook(organizationId);
    const integration = await this.integrations.find(organizationId, 'BITRIX');

    const fromDate = since ?? this.resumePoint(integration?.syncedUpTo?.toDate());

    try {
      const { records, truncated } = await this.client.fetchCalls({ webhookUrl, fromDate });
      const { calls, rejected } = mapBitrixCalls(records);

      const summary = await this.importer.importCalls(
        organizationId,
        calls,
        'BITRIX',
        // В Bitrix звонок привязан к пользователю портала, а не к номеру.
        'externalKey',
      );

      const latest = this.latestCallDate(calls.map((call) => call.startedAt));

      await this.integrations.recordSync(organizationId, 'BITRIX', 'OK', {
        // Точку продолжения двигаем только при полной выгрузке: иначе
        // пропустили бы всё, что осталось за пределом страниц.
        syncedUpTo: truncated ? undefined : latest,
      });

      return {
        ...summary,
        fetched: records.length,
        rejected: rejected.length,
        truncated,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Неизвестная ошибка';
      await this.integrations.recordSync(organizationId, 'BITRIX', 'ERROR', { error: message });

      this.logger.error(`Синхронизация Bitrix24 не удалась: ${message}`);
      throw cause;
    }
  }

  private resumePoint(syncedUpTo?: Date): Date | undefined {
    if (!syncedUpTo) return undefined;
    return new Date(syncedUpTo.getTime() - OVERLAP_MINUTES * 60 * 1000);
  }

  private latestCallDate(dates: Date[]): Date | undefined {
    if (dates.length === 0) return undefined;
    return dates.reduce((latest, date) => (date > latest ? date : latest));
  }
}
