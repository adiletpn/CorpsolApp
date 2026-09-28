import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { normalizePhone } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, callDocId } from '../firestore/collections';
import type { CallDoc, UserDoc } from '../firestore/types';
import { localWorkDateKey } from '../common/utils/time';
import type { ImportedCall, MatchBy } from './types';

export interface ImportSummary {
  /** Записано новых звонков. */
  imported: number;
  /** Пропущено как уже загруженные ранее. */
  duplicates: number;
  /** Не удалось сопоставить с сотрудником. */
  unmatched: Array<{ employeeKey: string; count: number }>;
}

/**
 * Пороговая доля несопоставленных звонков, после которой импорт
 * считается подозрительным. Если больше половины выгрузки не легло
 * на сотрудников, скорее всего перепутан столбец или не заведены
 * рабочие номера — молчать об этом нельзя.
 */
const UNMATCHED_ALERT_RATIO = 0.5;

interface EmployeeRef {
  userId: string;
  departmentId: string | null;
}

@Injectable()
export class CallsImportService {
  private readonly logger = new Logger(CallsImportService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Загружает разобранные звонки.
   *
   * Способ сопоставления зависит от источника: детализация оператора
   * опознаёт сотрудника по рабочему номеру, Bitrix24 — по идентификатору
   * пользователя портала.
   */
  async importCalls(
    organizationId: string,
    calls: ImportedCall[],
    source: CallDoc['source'],
    matchBy: MatchBy = 'phone',
    timezone = 'Asia/Almaty',
  ): Promise<ImportSummary> {
    if (calls.length === 0) {
      return { imported: 0, duplicates: 0, unmatched: [] };
    }

    const index = await this.buildIndex(organizationId, source, matchBy);

    const unmatchedCounts = new Map<string, number>();
    let imported = 0;
    let duplicates = 0;

    // Firestore ограничивает пакет 500 операциями, поэтому режем на части.
    for (const chunk of this.chunk(calls, 400)) {
      const batch = this.db.batch();
      let writesInBatch = 0;

      const existing = await this.findExisting(source, chunk);

      for (const call of chunk) {
        const key = matchBy === 'phone' ? normalizePhone(call.employeeKey) : call.employeeKey;
        const match = key ? index.get(key) : undefined;

        if (!match) {
          const label = call.employeeKey;
          unmatchedCounts.set(label, (unmatchedCounts.get(label) ?? 0) + 1);
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
          // Статус по времени разговора: нулевое означает, что трубку не подняли.
          status: call.talkSeconds > 0 ? 'ANSWERED' : 'NO_ANSWER',
          clientPhone: call.clientPhone,
          startedAt: Timestamp.fromDate(call.startedAt),
          callDate: localWorkDateKey(call.startedAt, timezone),
          durationSeconds: call.durationSeconds,
          talkSeconds: call.talkSeconds,
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
      .map(([employeeKey, count]) => ({ employeeKey, count }))
      .sort((a, b) => b.count - a.count);

    this.warnIfMostlyUnmatched(calls.length, unmatched);

    return { imported, duplicates, unmatched };
  }

  /**
   * Индекс «ключ источника → сотрудник».
   *
   * Для телефонов берём и номер из карточки, и явные привязки рабочих
   * номеров; явная привязка важнее, потому что личный телефон в карточке
   * не всегда тот, с которого звонят клиентам.
   *
   * Для внешних идентификаторов карточка не годится вовсе — только
   * заведённые вручную соответствия.
   */
  private async buildIndex(
    organizationId: string,
    source: CallDoc['source'],
    matchBy: MatchBy,
  ): Promise<Map<string, EmployeeRef>> {
    const index = new Map<string, EmployeeRef>();

    const users = await this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .get();

    const byId = new Map(users.docs.map((doc) => [doc.id, doc.data() as UserDoc]));

    if (matchBy === 'phone') {
      for (const [userId, user] of byId) {
        const phone = normalizePhone(user.phone);
        if (phone) index.set(phone, { userId, departmentId: user.departmentId });
      }
    }

    const identities = await this.db
      .collection(COLLECTIONS.externalIdentities)
      .where('provider', '==', source)
      .get();

    for (const doc of identities.docs) {
      const identity = doc.data() as { userId: string; externalKey: string };
      const user = byId.get(identity.userId);
      if (!user) continue;

      const key =
        matchBy === 'phone' ? normalizePhone(identity.externalKey) : identity.externalKey;

      if (key) index.set(key, { userId: identity.userId, departmentId: user.departmentId });
    }

    return index;
  }

  /** Какие из звонков пачки уже лежат в базе. */
  private async findExisting(
    source: CallDoc['source'],
    calls: ImportedCall[],
  ): Promise<Set<string>> {
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
    unmatched: Array<{ employeeKey: string; count: number }>,
  ): void {
    const unmatchedTotal = unmatched.reduce((sum, item) => sum + item.count, 0);
    if (total === 0 || unmatchedTotal / total < UNMATCHED_ALERT_RATIO) return;

    this.logger.warn(
      `Не сопоставлено ${unmatchedTotal} из ${total} звонков. ` +
        `Проверьте рабочие номера сотрудников и столбец с номером абонента. ` +
        `Чаще всего встречались: ${unmatched
          .slice(0, 3)
          .map((item) => `${item.employeeKey} (${item.count})`)
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
