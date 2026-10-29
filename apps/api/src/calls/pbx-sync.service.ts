import { Injectable, Logger } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import { ALMATY_UTC_OFFSET_MINUTES } from './kcell-parser';
import { CallsImportService, type ImportSummary } from './calls-import.service';
import { IntegrationsService } from './integrations.service';
import { KcellApiClient } from './kcell-api-client';
import { mapKcellHistory } from './kcell-history';
import { SIPUNI_EXPORT_LIMIT, SipuniApiClient } from './sipuni-api-client';
import { mapSipuniExport } from './sipuni-stats';
import type { ImportedCall } from './types';

export interface PbxSyncResult extends ImportSummary {
  /** Звонков получено от АТС. */
  fetched: number;
  /** Не положить ни на кого: пропущенные на отдел, номер не привязан. */
  withoutEmployee: number;
}

/**
 * Насколько назад отступаем от точки прошлой синхронизации: звонок
 * попадает в историю АТС не мгновенно. Перекрытие безопасно —
 * повторные звонки отсекаются по ключу.
 */
const OVERLAP_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Предел страниц выгрузки Sipuni за один добор: 20 × 5000 звонков.
 * Обычный часовой добор укладывается в первую страницу, предел нужен
 * передобору с начала месяца, чтобы он не тянул всю историю аккаунта.
 */
export const SIPUNI_MAX_PAGES = 20;
const OFFSET_MS = ALMATY_UTC_OFFSET_MINUTES * 60 * 1000;

/** Полночь по Алматы того дня, в который попадает момент. */
export function almatyDayStart(moment: Date): Date {
  const local = moment.getTime() + OFFSET_MS;
  return new Date(local - (local % DAY_MS) - OFFSET_MS);
}

/** Первое число месяца по Алматы — откуда начинается первая синхронизация. */
export function almatyMonthStart(moment: Date): Date {
  const local = new Date(moment.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS);
}

/**
 * Звонки из АТС: Kcell и Sipuni одновременно, у каждого сотрудника свой
 * источник или оба сразу — как в мониторинге операторов.
 */
@Injectable()
export class PbxSyncService {
  private readonly logger = new Logger(PbxSyncService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly integrations: IntegrationsService,
    private readonly importer: CallsImportService,
    private readonly kcell: KcellApiClient,
    private readonly sipuni: SipuniApiClient,
  ) {}

  /**
   * Откуда начинать: от прошлой точки с перекрытием, а впервые — с начала
   * месяца, чтобы дозвоны и планы сразу показывали весь месяц.
   */
  private async resumeFrom(organizationId: string, provider: 'KCELL' | 'SIPUNI', now: Date): Promise<Date> {
    const integration = await this.integrations.find(organizationId, provider);
    const syncedUpTo = integration?.syncedUpTo?.toDate();
    return syncedUpTo ? new Date(syncedUpTo.getTime() - OVERLAP_MS) : almatyMonthStart(now);
  }

  /**
   * История Kcell — по дням: метод без пагинации отдаёт отрезок одним
   * ответом, и месяц целиком — это тысячи записей за раз.
   */
  async syncKcell(organizationId: string, now = new Date(), since?: Date): Promise<PbxSyncResult> {
    const credentials = await this.integrations.requireCredentials(organizationId, 'KCELL');
    // since — передобор с заданной даты: например, после привязки
    // сотрудников, когда ранние звонки месяца ещё не на кого было положить.
    const from = since ?? (await this.resumeFrom(organizationId, 'KCELL', now));

    try {
      const total: PbxSyncResult = { imported: 0, duplicates: 0, unmatched: [], fetched: 0, withoutEmployee: 0 };

      for (let dayStart = almatyDayStart(from); dayStart < now; dayStart = new Date(dayStart.getTime() + DAY_MS)) {
        const rangeStart = dayStart < from ? from : dayStart;
        const rangeEnd = new Date(Math.min(dayStart.getTime() + DAY_MS - 1000, now.getTime()));

        const rows = await this.kcell.fetchHistory(
          { baseUrl: credentials.baseUrl, apiKey: credentials.apiKey },
          rangeStart,
          rangeEnd,
        );
        const mapped = mapKcellHistory(rows);
        const summary = await this.importer.importCalls(
          organizationId,
          mapped.calls,
          'KCELL',
          'externalKey',
          'Asia/Almaty',
          // API Kcell подписывает звонок логином сотрудника в АТС.
          'KCELL_USER',
        );

        total.fetched += mapped.calls.length;
        total.withoutEmployee += mapped.withoutEmployee;
        this.accumulate(total, summary);
      }

      await this.integrations.recordSync(organizationId, 'KCELL', 'OK', { syncedUpTo: now });
      return total;
    } catch (cause) {
      await this.recordFailure(organizationId, 'KCELL', cause);
      throw cause;
    }
  }

  /**
   * Sipuni отдаёт последние звонки аккаунта от свежих к старым; берём
   * те, что новее точки продолжения. Сотрудник — по внутреннему номеру
   * из привязок, поэтому без привязок разложить звонки не на кого.
   */
  async syncSipuni(organizationId: string, now = new Date(), since?: Date): Promise<PbxSyncResult> {
    const credentials = await this.integrations.requireCredentials(organizationId, 'SIPUNI');
    const from = since ?? (await this.resumeFrom(organizationId, 'SIPUNI', now));

    try {
      const extensions = await this.sipuniExtensions(organizationId);
      const fresh: ImportedCall[] = [];
      let withoutEmployee = 0;

      // Выгрузка идёт от свежих к старым по 5000 звонков: листаем, пока
      // не дойдём до точки продолжения. Одна страница — это иногда пара
      // дней, и передобор с начала месяца без листания терял его начало.
      for (let page = 1; page <= SIPUNI_MAX_PAGES; page += 1) {
        const csv = await this.sipuni.exportAll({ user: credentials.user, secret: credentials.secret }, page);
        const mapped = mapSipuniExport(csv, extensions);
        fresh.push(...mapped.calls.filter((call) => call.startedAt >= from && call.startedAt <= now));
        withoutEmployee += mapped.withoutEmployee;

        const reachedStart = mapped.oldest !== null && mapped.oldest < from;
        if (reachedStart || mapped.rows < SIPUNI_EXPORT_LIMIT) break;
      }

      const summary = await this.importer.importCalls(
        organizationId,
        fresh,
        'SIPUNI',
        'externalKey',
        'Asia/Almaty',
        'SIPUNI',
      );

      await this.integrations.recordSync(organizationId, 'SIPUNI', 'OK', { syncedUpTo: now });
      return { ...summary, fetched: fresh.length, withoutEmployee };
    } catch (cause) {
      await this.recordFailure(organizationId, 'SIPUNI', cause);
      throw cause;
    }
  }

  private async sipuniExtensions(organizationId: string): Promise<string[]> {
    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.externalIdentities)
      .where('provider', '==', 'SIPUNI')
      .get();

    return snapshot.docs
      .map((doc) => doc.data() as { organizationId?: string; externalKey: string })
      .filter((identity) => identity.organizationId === organizationId)
      .map((identity) => identity.externalKey);
  }

  private accumulate(total: PbxSyncResult, summary: ImportSummary): void {
    total.imported += summary.imported;
    total.duplicates += summary.duplicates;
    for (const item of summary.unmatched) {
      const existing = total.unmatched.find((entry) => entry.employeeKey === item.employeeKey);
      if (existing) existing.count += item.count;
      else total.unmatched.push({ ...item });
    }
  }

  private async recordFailure(organizationId: string, provider: 'KCELL' | 'SIPUNI', cause: unknown): Promise<void> {
    const message = cause instanceof Error ? cause.message : 'Неизвестная ошибка';
    await this.integrations.recordSync(organizationId, provider, 'ERROR', { error: message });
    this.logger.error(`Звонки ${provider} не добраны для ${organizationId}: ${message}`);
  }
}
