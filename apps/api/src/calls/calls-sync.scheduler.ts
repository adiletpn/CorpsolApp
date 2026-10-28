import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { COLLECTIONS } from '../firestore/collections';
import { FirebaseService } from '../firebase/firebase.service';
import { JobLockService } from '../common/jobs/job-lock.service';
import { BitrixSyncService } from './bitrix-sync.service';
import { PbxSyncService } from './pbx-sync.service';

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
        };
        const organizationId = integration.organizationId;
        if (!organizationId) continue;
        // АТС без ключа — старая выгрузка файлом: тянуть по сети нечего.
        if (source !== 'BITRIX' && (!integration.isActive || !integration.credentials)) continue;

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
