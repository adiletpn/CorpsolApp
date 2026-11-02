import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { COLLECTIONS } from '../firestore/collections';
import { FirebaseService } from '../firebase/firebase.service';
import { JobLockService } from '../common/jobs/job-lock.service';
import { BitrixSyncService } from './bitrix-sync.service';
import { PbxSyncService } from './pbx-sync.service';
import { BitrixDealsSyncService } from '../offers/bitrix-deals-sync.service';

/** Источники, которые добираются по сети, а не загружаются файлом. */
const SOURCES = ['BITRIX', 'KCELL', 'SIPUNI'] as const;
type Source = (typeof SOURCES)[number];

/**
 * Автоматический добор звонков из Bitrix24, Kcell и Sipuni.
 *
 * Без него выгрузку приходится запускать руками, а значит — не запускать
 * вовсе: в понедельник никто не вспомнит про пятницу. Планы по звонкам
 * при этом считаются по пустой базе и показывают ноль у тех, кто работал.
 */
@Injectable()
export class CallsSyncScheduler {
  private readonly logger = new Logger(CallsSyncScheduler.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly bitrix: BitrixSyncService,
    private readonly locks: JobLockService,
    private readonly pbx: PbxSyncService,
    private readonly deals: BitrixDealsSyncService,
  ) {}

  /**
   * Раз в час. Чаще незачем: звонок попадает в отчёты того же дня,
   * а портал на частые выгрузки отвечает ограничением скорости.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runHourly(): Promise<void> {
    const results = await this.syncAll();
    const imported = results.reduce((total, item) => total + item.imported, 0);

    if (results.length > 0) {
      this.logger.log(`Звонки добраны: ${imported} в ${results.length} организациях`);
    }

    const deals = await this.syncDeals();
    if (deals.length > 0) {
      const changed = deals.reduce((total, item) => total + item.changed, 0);
      this.logger.log(`Сделки добраны: ${changed} новых и изменённых в ${deals.length} организациях`);
    }
  }

  /**
   * Сделки CRM — тем же часовым прогоном, но своим замком: сбой сделок
   * не должен оставить без звонков, и наоборот.
   */
  async syncDeals(now = new Date()): Promise<Array<{ organizationId: string; changed: number }>> {
    const hour = now.toISOString().slice(0, 13);
    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.integrations)
      .where('provider', '==', 'BITRIX')
      .get();

    const results: Array<{ organizationId: string; changed: number }> = [];
    for (const doc of snapshot.docs) {
      const integration = doc.data() as { organizationId?: string; isActive?: boolean; webhookUrl?: string | null };
      const organizationId = integration.organizationId;
      if (!organizationId || integration.isActive === false || !integration.webhookUrl) continue;

      try {
        const result = await this.locks.run('deals-sync', `${organizationId}_${hour}`, async () => {
          const summary = await this.deals.sync(organizationId, now);
          const changed = summary.created + summary.updated;
          return { count: changed, changed };
        });
        if (result) results.push({ organizationId, changed: result.changed });
      } catch (cause) {
        this.logger.error(`Добор сделок для ${organizationId} не удался: ${String(cause)}`);
      }
    }
    return results;
  }

  /**
   * Обход подключённых источников всех организаций.
   *
   * Отрезок замка — источник, организация и текущий час: повторный запуск
   * внутри часа ничего не делает. Сбой одной АТС не оставляет без звонков
   * ни другую АТС, ни другие организации — ошибка уже записана в саму
   * интеграцию, её видно в панели.
   */
  async syncAll(
    now = new Date(),
  ): Promise<Array<{ organizationId: string; source: Source; imported: number }>> {
    const hour = now.toISOString().slice(0, 13);
    const results: Array<{ organizationId: string; source: Source; imported: number }> = [];

    for (const source of SOURCES) {
      const snapshot = await this.firebase.firestore
        .collection(COLLECTIONS.integrations)
        .where('provider', '==', source)
        .get();

      for (const doc of snapshot.docs) {
        const integration = doc.data() as {
          organizationId?: string;
          isActive?: boolean;
          credentials?: Record<string, string> | null;
          importCalls?: boolean;
        };
        const organizationId = integration.organizationId;
        if (!organizationId) continue;
        // АТС без ключа — старая выгрузка файлом: тянуть по сети нечего.
        if (source !== 'BITRIX' && (!integration.isActive || !integration.credentials)) continue;
        // Портал подключён только ради сделок — звонки идут из АТС.
        if (source === 'BITRIX' && integration.importCalls === false) continue;

        try {
          const result = await this.locks.run(
            // Имя замка Bitrix прежнее: под ним уже лежат прогоны в базе.
            source === 'BITRIX' ? 'calls-sync' : `calls-sync-${source.toLowerCase()}`,
            `${organizationId}_${hour}`,
            async () => {
              const summary = await this.syncOne(source, organizationId, now);
              return { count: summary.imported, imported: summary.imported };
            },
          );

          if (result) results.push({ organizationId, source, imported: result.imported });
        } catch (cause) {
          this.logger.error(`Добор звонков ${source} для ${organizationId} не удался: ${String(cause)}`);
        }
      }
    }

    return results;
  }

  private syncOne(source: Source, organizationId: string, now: Date): Promise<{ imported: number }> {
    if (source === 'KCELL') return this.pbx.syncKcell(organizationId, now);
    if (source === 'SIPUNI') return this.pbx.syncSipuni(organizationId, now);
    return this.bitrix.sync(organizationId);
  }
}
