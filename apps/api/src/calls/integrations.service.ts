import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { isValidWebhook, maskWebhook } from './bitrix-client';
import { isValidKcellBaseUrl, maskKey, type KcellCredentials } from './kcell-api-client';
import type { SipuniCredentials } from './sipuni-api-client';

export type IntegrationProvider = 'BITRIX' | 'KCELL' | 'SIPUNI';

interface IntegrationDoc {
  organizationId: string;
  provider: IntegrationProvider;
  isActive: boolean;
  /** Вебхук портала. Наружу не отдаётся никогда. */
  webhookUrl: string | null;
  /**
   * Доступ к АТС: адрес и ключ API Kcell или логин и секрет Sipuni.
   * Как и вебхук, наружу не отдаётся — в панели только маска.
   */
  credentials?: Record<string, string> | null;
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
  /** Доступ к АТС так, чтобы его можно было узнать, но не использовать. */
  credentialsMasked: string | null;
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

  /** API Kcell: адрес кабинета и ключ из «Интеграция с CRM → REST API». */
  async connectKcell(actor: AuthenticatedUser, credentials: KcellCredentials): Promise<IntegrationView> {
    const baseUrl = credentials.baseUrl.trim().replace(/\/$/, '');
    if (!isValidKcellBaseUrl(baseUrl)) {
      throw new BadRequestException('Адрес должен выглядеть как https://компания.vpbx.kcell.kz/crmapi/v1');
    }
    if (!credentials.apiKey.trim()) throw new BadRequestException('Нужен ключ API Kcell');

    return this.connectPbx(actor, 'KCELL', { baseUrl, apiKey: credentials.apiKey.trim() });
  }

  /** Sipuni: номер аккаунта и секрет из «Настройки → API». */
  async connectSipuni(actor: AuthenticatedUser, credentials: SipuniCredentials): Promise<IntegrationView> {
    const user = credentials.user.trim();
    if (!/^\d{3,12}$/.test(user)) {
      throw new BadRequestException('Номер аккаунта Sipuni — только цифры, как в кабинете');
    }
    if (!credentials.secret.trim()) throw new BadRequestException('Нужен секрет API Sipuni');

    return this.connectPbx(actor, 'SIPUNI', { user, secret: credentials.secret.trim() });
  }

  private async connectPbx(
    actor: AuthenticatedUser,
    provider: 'KCELL' | 'SIPUNI',
    credentials: Record<string, string>,
  ): Promise<IntegrationView> {
    const doc: IntegrationDoc = {
      organizationId: actor.organizationId,
      provider,
      isActive: true,
      webhookUrl: null,
      credentials,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      syncedUpTo: null,
    };

    await this.collection.doc(docId(actor.organizationId, provider)).set(doc);
    return this.toView(doc);
  }

  /** Доступ к АТС для внутреннего использования. Наружу не уходит. */
  async requireCredentials(organizationId: string, provider: 'KCELL' | 'SIPUNI'): Promise<Record<string, string>> {
    const doc = await this.find(organizationId, provider);
    if (!doc?.isActive || !doc.credentials) {
      throw new NotFoundException(`Интеграция ${provider === 'KCELL' ? 'с Kcell' : 'с Sipuni'} не настроена`);
    }
    return doc.credentials;
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
      credentials: null,
    });
  }

  private toView(doc: IntegrationDoc): IntegrationView {
    return {
      provider: doc.provider,
      isActive: doc.isActive,
      webhookMasked: doc.webhookUrl ? maskWebhook(doc.webhookUrl) : null,
      credentialsMasked: this.maskCredentials(doc),
      lastSyncAt: doc.lastSyncAt?.toDate().toISOString() ?? null,
      lastSyncStatus: doc.lastSyncStatus,
      lastSyncError: doc.lastSyncError,
      syncedUpTo: doc.syncedUpTo?.toDate().toISOString() ?? null,
    };
  }

  private maskCredentials(doc: IntegrationDoc): string | null {
    const credentials = doc.credentials;
    if (!credentials) return null;

    if (doc.provider === 'KCELL') {
      const host = credentials.baseUrl?.replace(/^https:\/\//, '').split('/')[0] ?? '';
      return `${host} · ключ ${maskKey(credentials.apiKey ?? '')}`;
    }
    return `аккаунт ${credentials.user} · секрет ${maskKey(credentials.secret ?? '')}`;
  }
}
