import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { COLLECTIONS, jobRunDocId } from '../../firestore/collections';
import { FirebaseService } from '../../firebase/firebase.service';
import type { JobRunDoc } from '../../firestore/types';

/**
 * Замок фоновых прогонов.
 *
 * Расписание живёт внутри процесса, поэтому в трёх экземплярах сервера
 * сработает трижды. Договариваться между собой им нечем — гонку
 * разрешает сама база: документ с детерминированным ключом успевает
 * создать только один.
 */
@Injectable()
export class JobLockService {
  private readonly logger = new Logger(JobLockService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private ref(job: string, scope: string) {
    return this.firebase.firestore
      .collection(COLLECTIONS.jobRuns)
      .doc(jobRunDocId(job, scope));
  }

  /** Занимает прогон за собой. false — его уже ведёт кто-то другой. */
  async claim(job: string, scope: string): Promise<boolean> {
    const record: JobRunDoc = {
      job,
      scope,
      startedAt: Timestamp.now(),
      finishedAt: null,
      marked: null,
    };

    try {
      await this.ref(job, scope).create(record);
      return true;
    } catch {
      return false;
    }
  }

  /** Отметка об успешном прогоне: виден и факт, и объём сделанного. */
  async finish(job: string, scope: string, marked: number): Promise<void> {
    await this.ref(job, scope).update({ finishedAt: Timestamp.now(), marked });
  }

  /**
   * Снимает замок после неудачи.
   *
   * Иначе упавший прогон закрыл бы этот отрезок навсегда: расписание
   * в ту же дату больше не сработает, и работу пришлось бы доделывать
   * руками.
   */
  async release(job: string, scope: string): Promise<void> {
    try {
      await this.ref(job, scope).delete();
    } catch (cause) {
      this.logger.error(`Не снят замок ${job}/${scope}: ${String(cause)}`);
    }
  }

  /**
   * Берёт замок, выполняет работу и прибирает за собой.
   *
   * Возвращает null, когда прогон уже ведёт другой экземпляр, — вызывающий
   * отличает «не моя очередь» от «сделано ноль».
   */
  async run<T extends { count: number }>(
    job: string,
    scope: string,
    work: () => Promise<T>,
  ): Promise<T | null> {
    if (!(await this.claim(job, scope))) return null;

    try {
      const result = await work();
      await this.finish(job, scope, result.count);
      return result;
    } catch (cause) {
      await this.release(job, scope);
      throw cause;
    }
  }
}
