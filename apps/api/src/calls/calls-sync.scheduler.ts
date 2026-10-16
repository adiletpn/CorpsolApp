import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { COLLECTIONS } from '../firestore/collections';
import { FirebaseService } from '../firebase/firebase.service';
import { JobLockService } from '../common/jobs/job-lock.service';
import { BitrixSyncService } from './bitrix-sync.service';

/**
 * Автоматический добор звонков из Bitrix24.
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
   * Обход организаций с подключённым Bitrix24.
   *
   * Отрезок замка — организация и текущий час: так повторный запуск
   * внутри часа ничего не делает, а следующий час берётся заново.
   */
  async syncAll(now = new Date()): Promise<Array<{ organizationId: string; imported: number }>> {
    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.integrations)
      .where('provider', '==', 'BITRIX')
      .get();

    const hour = now.toISOString().slice(0, 13);
    const results: Array<{ organizationId: string; imported: number }> = [];

    for (const doc of snapshot.docs) {
      const organizationId = (doc.data() as { organizationId?: string }).organizationId;
      if (!organizationId) continue;

      try {
        const result = await this.locks.run(
          'calls-sync',
          `${organizationId}_${hour}`,
          async () => {
            const summary = await this.bitrix.sync(organizationId);
            return { count: summary.imported, imported: summary.imported };
          },
        );

        if (result) results.push({ organizationId, imported: result.imported });
      } catch (cause) {
        // Недоступный портал одной компании не должен оставить без
        // звонков все остальные. Ошибка уже записана в саму интеграцию,
        // её видно в панели.
        this.logger.error(
          `Добор звонков для ${organizationId} не удался: ${String(cause)}`,
        );
      }
    }

    return results;
  }
}
