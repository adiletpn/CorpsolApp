import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { normalizePhone } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, callDocId, externalIdentityDocId } from '../firestore/collections';
import type { CallDoc, UserDoc } from '../firestore/types';
import { localWorkDateKey } from '../common/utils/time';
import type { ParsedCall } from './kcell-parser';

export interface ImportSummary {
  /** Записано новых звонков. */
  imported: number;
  /** Пропущено как уже загруженные ранее. */
  duplicates: number;
  /** Не удалось сопоставить с сотрудником. */
  unmatched: Array<{ employeePhone: string; count: number }>;
}

/**
 * Пороговая доля несопоставленных звонков, после которой импорт
 * считается подозрительным. Если больше половины выгрузки не легло
 * на сотрудников, скорее всего перепутан столбец или не заведены
 * рабочие номера — молчать об этом нельзя.
 */
const UNMATCHED_ALERT_RATIO = 0.5;

@Injectable()
export class CallsImportService {
  private readonly logger = new Logger(CallsImportService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Загружает разобранные звонки. Сопоставление идёт по рабочему номеру:
   * сначала по явно заданным идентификаторам источника, затем по телефону
   * в карточке сотрудника.
   */
  async importCalls(
    organizationId: string,
    calls: ParsedCall[],
    source: CallDoc['source'],
    timezone = 'Asia/Almaty',
  ): Promise<ImportSummary> {
    if (calls.length === 0) {
      return { imported: 0, duplicates: 0, unmatched: [] };
    }

    const byPhone = await this.buildPhoneIndex(organizationId, source);

    const unmatchedCounts = new Map<string, number>();
    let imported = 0;
    let duplicates = 0;

    // Firestore ограничивает пакет 500 операциями, поэтому режем на части.
    const batches = this.chunk(calls, 400);

    for (const chunk of batches) {
      const batch = this.db.batch();
      let writesInBatch = 0;

      const existing = await this.findExisting(source, chunk);

      for (const call of chunk) {
        const match = byPhone.get(call.employeePhone);

        if (!match) {
          unmatchedCounts.set(
            call.employeePhone,
            (unmatchedCounts.get(call.employeePhone) ?? 0) + 1,
          );
          continue;
        }

        const id = callDocId(source, call.externalId);
        if (existing.has(id)) {
          duplicates += 1;
          continue;
        }

        const doc: CallDoc = {
          userId: match.userId,
          organizationId,
          departmentId: match.departmentId,
          source,
          direction: call.direction,
          // Статус по длительности разговора: нулевая означает,
          // что трубку не подняли.
          status: call.durationSeconds > 0 ? 'ANSWERED' : 'NO_ANSWER',
          clientPhone: call.clientPhone,
          startedAt: Timestamp.fromDate(call.startedAt),
          callDate: localWorkDateKey(call.startedAt, timezone),
          durationSeconds: call.durationSeconds,
          talkSeconds: call.durationSeconds,
          recordingUrl: null,
          importedAt: Timestamp.now(),
        };

        batch.create(this.db.collection(COLLECTIONS.calls).doc(id), doc);
        writesInBatch += 1;
        imported += 1;
      }

      if (writesInBatch > 0) await batch.commit();
    }

    const unmatched = [...unmatchedCounts.entries()]
      .map(([employeePhone, count]) => ({ employeePhone, count }))
      .sort((a, b) => b.count - a.count);

    this.warnIfMostlyUnmatched(calls.length, unmatched);

    return { imported, duplicates, unmatched };
  }

  /**
   * Индекс «рабочий номер → сотрудник».
   *
   * Сначала берём явные сопоставления из ExternalIdentity: у сотрудника
   * может быть номер, не совпадающий с личным телефоном в карточке.
   * Затем добираем по телефону из карточки.
   */
  private async buildPhoneIndex(
    organizationId: string,
    source: CallDoc['source'],
  ): Promise<Map<string, { userId: string; departmentId: string | null }>> {
    const index = new Map<string, { userId: string; departmentId: string | null }>();

    const users = await this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .get();

    const byId = new Map(users.docs.map((doc) => [doc.id, doc.data() as UserDoc]));

    for (const [userId, user] of byId) {
      const phone = normalizePhone(user.phone);
      if (phone) index.set(phone, { userId, departmentId: user.departmentId });
    }

    const identities = await this.db
      .collection(COLLECTIONS.externalIdentities)
      .where('provider', '==', source)
      .get();

    for (const doc of identities.docs) {
      const identity = doc.data() as { userId: string; externalKey: string };
      const phone = normalizePhone(identity.externalKey);
      const user = byId.get(identity.userId);

      // Явное сопоставление важнее номера из карточки, поэтому перетирает его.
      if (phone && user) {
        index.set(phone, { userId: identity.userId, departmentId: user.departmentId });
      }
    }

    return index;
  }

  /** Какие из звонков пачки уже лежат в базе. */
  private async findExisting(source: CallDoc['source'], calls: ParsedCall[]): Promise<Set<string>> {
    const refs = calls.map((call) =>
      this.db.collection(COLLECTIONS.calls).doc(callDocId(source, call.externalId)),
    );

    const found = new Set<string>();

    // getAll принимает ограниченное число ссылок за раз.
    for (const chunk of this.chunk(refs, 100)) {
      const snapshots = await this.db.getAll(...chunk);
      for (const snapshot of snapshots) {
        if (snapshot.exists) found.add(snapshot.id);
      }
    }

    return found;
  }

  /**
   * Массовое несопоставление почти всегда означает ошибку настройки,
   * а не отсутствие сотрудников. Импорт при этом формально успешен,
   * поэтому предупреждение в журнал обязательно.
   */
  private warnIfMostlyUnmatched(
    total: number,
    unmatched: Array<{ employeePhone: string; count: number }>,
  ): void {
    const unmatchedTotal = unmatched.reduce((sum, item) => sum + item.count, 0);
    if (total === 0 || unmatchedTotal / total < UNMATCHED_ALERT_RATIO) return;

    this.logger.warn(
      `Не сопоставлено ${unmatchedTotal} из ${total} звонков. ` +
        `Проверьте рабочие номера сотрудников и столбец с номером абонента. ` +
        `Чаще всего встречались: ${unmatched
          .slice(0, 3)
          .map((item) => `${item.employeePhone} (${item.count})`)
          .join(', ')}`,
    );
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
