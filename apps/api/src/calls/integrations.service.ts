import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { isValidWebhook, maskWebhook } from './bitrix-client';

export type IntegrationProvider = 'BITRIX' | 'KCELL';

interface IntegrationDoc {
  organizationId: string;
  provider: IntegrationProvider;
  isActive: boolean;
  /** Вебхук портала. Наружу не отдаётся никогда. */
  webhookUrl: string | null;
  lastSyncAt: Timestamp | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  /** Время последнего успешно загруженного звонка — точка доборной синхронизации. */
  syncedUpTo: Timestamp | null;
}

/** Вид интеграции для интерфейса: с замаскированным адресом. */
export interface IntegrationView {
  provider: IntegrationProvider;
  isActive: boolean;
  webhookMasked: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  syncedUpTo: string | null;
}

const docId = (organizationId: string, provider: IntegrationProvider): string =>
  `${organizationId}_${provider}`;

@Injectable()
export class IntegrationsService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.integrations);
  }

  async connectBitrix(actor: AuthenticatedUser, webhookUrl: string): Promise<IntegrationView> {
    const trimmed = webhookUrl.trim().replace(/\/$/, '');
    if (!isValidWebhook(trimmed)) {
      throw new BadRequestException(
        'Адрес должен выглядеть как https://портал.bitrix24.kz/rest/1/токен',
      );
    }

    const doc: IntegrationDoc = {
      organizationId: actor.organizationId,
      provider: 'BITRIX',
      isActive: true,
      webhookUrl: trimmed,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      syncedUpTo: null,
    };

    await this.collection.doc(docId(actor.organizationId, 'BITRIX')).set(doc);
    return this.toView(doc);
  }

  /** Адрес вебхука для внутреннего использования. Наружу не уходит. */
  async requireWebhook(organizationId: string): Promise<string> {
    const snapshot = await this.collection.doc(docId(organizationId, 'BITRIX')).get();
    const doc = snapshot.data() as IntegrationDoc | undefined;

    if (!snapshot.exists || !doc?.webhookUrl || !doc.isActive) {
      throw new NotFoundException('Интеграция с Bitrix24 не настроена');
    }
    return doc.webhookUrl;
  }

  async find(
    organizationId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationDoc | null> {
    const snapshot = await this.collection.doc(docId(organizationId, provider)).get();
    return snapshot.exists ? (snapshot.data() as IntegrationDoc) : null;
  }

  async list(actor: AuthenticatedUser): Promise<IntegrationView[]> {
    const snapshot = await this.collection
      .where('organizationId', '==', actor.organizationId)
      .get();

    return snapshot.docs.map((doc) => this.toView(doc.data() as IntegrationDoc));
  }

  /** Отметка результата синхронизации — видна в панели администратора. */
  async recordSync(
    organizationId: string,
    provider: IntegrationProvider,
    status: string,
    options: { error?: string; syncedUpTo?: Date } = {},
  ): Promise<void> {
    await this.collection.doc(docId(organizationId, provider)).update({
      lastSyncAt: Timestamp.now(),
      lastSyncStatus: status,
      lastSyncError: options.error ?? null,
      ...(options.syncedUpTo ? { syncedUpTo: Timestamp.fromDate(options.syncedUpTo) } : {}),
    });
  }

  async disconnect(actor: AuthenticatedUser, provider: IntegrationProvider): Promise<void> {
    await this.collection.doc(docId(actor.organizationId, provider)).update({
      isActive: false,
      // Токен стираем, а не просто отключаем: отключённая интеграция
      // не должна оставлять рабочий доступ к порталу в базе.
      webhookUrl: null,
    });
  }

  private toView(doc: IntegrationDoc): IntegrationView {
    return {
      provider: doc.provider,
      isActive: doc.isActive,
      webhookMasked: doc.webhookUrl ? maskWebhook(doc.webhookUrl) : null,
      lastSyncAt: doc.lastSyncAt?.toDate().toISOString() ?? null,
      lastSyncStatus: doc.lastSyncStatus,
      lastSyncError: doc.lastSyncError,
      syncedUpTo: doc.syncedUpTo?.toDate().toISOString() ?? null,
    };
  }
}
