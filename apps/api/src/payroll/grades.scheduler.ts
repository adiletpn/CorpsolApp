import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { OrganizationDoc } from '../firestore/types';
import { JobLockService } from '../common/jobs/job-lock.service';
import { localWorkDateKey } from '../common/utils/time';
import { GradesService } from './grades.service';

/** Прошлый месяц для календарной даты «ГГГГ-ММ-ДД». */
export function previousMonth(dateKey: string): { year: number; month: number } {
  const [year, month] = dateKey.split('-').map(Number);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * Ранги на новый месяц — по итогу прошлого.
 *
 * Прогон каждую ночь, а не только первого числа: если сервер в ту ночь
 * лежал, ранги всё равно пересчитаются. Замок на организацию и месяц
 * держит пересмотр однократным — ранг, выставленный директором руками
 * в середине месяца, ночью не перезапишется.
 */
@Injectable()
export class GradesScheduler {
  private readonly logger = new Logger(GradesScheduler.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly grades: GradesService,
    private readonly locks: JobLockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runNightly(): Promise<void> {
    const results = await this.regradeEverywhere();
    const changed = results.reduce((total, item) => total + item.changed, 0);
    if (results.length > 0) this.logger.log(`Ранги пересмотрены: ${changed} переводов в ${results.length} организациях`);
  }

  async regradeEverywhere(now = new Date()): Promise<Array<{ organizationId: string; month: string; changed: number }>> {
    const organizations = await this.firebase.firestore.collection(COLLECTIONS.organizations).get();
    const results: Array<{ organizationId: string; month: string; changed: number }> = [];

    for (const doc of organizations.docs) {
      const timezone = (doc.data() as OrganizationDoc).timezone ?? 'Asia/Almaty';
      const { year, month } = previousMonth(localWorkDateKey(now, timezone));
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;

      try {
        const result = await this.locks.run('grades-monthly', `${doc.id}_${monthKey}`, async () => {
          const changes = await this.grades.regradeForMonth(doc.id, year, month);
          return { count: changes.length };
        });
        if (result) results.push({ organizationId: doc.id, month: monthKey, changed: result.count });
      } catch (cause) {
        this.logger.error(`Ранги за ${monthKey} не пересмотрены в организации ${doc.id}: ${String(cause)}`);
      }
    }

    return results;
  }
}
