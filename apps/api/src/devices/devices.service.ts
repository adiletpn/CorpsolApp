import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import type { Role } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, deviceDocId } from '../firestore/collections';
import type { DeviceDoc, DeviceRequestDoc, UserDoc } from '../firestore/types';
import { AUTH_ERRORS } from '../auth/auth.errors';
import type { DeviceDescriptorDto } from '../auth/dto';

/**
 * Роли, работающие «в поле»: для них аккаунт жёстко привязан к одному телефону.
 * Руководители заходят в веб-панель с любого браузера.
 */
const DEVICE_BOUND_ROLES: Role[] = ['MOP', 'ROP'];

export function requiresBoundDevice(role: Role): boolean {
  return DEVICE_BOUND_ROLES.includes(role);
}

export interface BoundDevice extends DeviceDoc {
  /** Идентификатор телефона, он же ID документа. */
  deviceId: string;
}

@Injectable()
export class DevicesService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Сопоставляет предъявленное устройство с привязкой аккаунта.
   * Вызывается не только при входе, но и на каждом защищённом запросе:
   * Firebase Auth по своей природе разрешает вход с любого числа устройств,
   * поэтому запрет держится исключительно на этой проверке.
   */
  async resolveForRequest(
    userId: string,
    user: UserDoc,
    descriptor?: DeviceDescriptorDto,
  ): Promise<BoundDevice | null> {
    if (!descriptor) {
      if (requiresBoundDevice(user.role)) {
        throw new ForbiddenException({ code: AUTH_ERRORS.DEVICE_REQUIRED });
      }
      return null;
    }

    const docId = deviceDocId(descriptor.deviceId);
    const ref = this.db.collection(COLLECTIONS.devices).doc(docId);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      const existing = snapshot.data() as DeviceDoc;

      // Телефон закреплён за другим сотрудником — это и есть попытка
      // отметиться за коллегу с его устройства.
      if (existing.isActive && existing.userId !== userId) {
        throw new ConflictException({ code: AUTH_ERRORS.DEVICE_TAKEN });
      }

      if (existing.isActive && existing.userId === userId) {
        await ref.update({
          lastSeenAt: Timestamp.now(),
          model: descriptor.model ?? existing.model,
          osVersion: descriptor.osVersion ?? existing.osVersion,
          appVersion: descriptor.appVersion ?? existing.appVersion,
        });
        return { ...existing, deviceId: descriptor.deviceId };
      }
    }

    const activeBinding = await this.findActiveBinding(userId);

    // Аккаунт уже занят другим телефоном — нужен явный аппрув HR.
    if (activeBinding) {
      await this.requestRebind(userId, descriptor);
      throw new ForbiddenException({ code: AUTH_ERRORS.DEVICE_MISMATCH });
    }

    return this.bind(userId, descriptor);
  }

  /**
   * Первичная привязка. Выполняется в транзакции: между проверкой занятости
   * и записью не должно быть окна, в которое влезет параллельный вход.
   */
  async bind(userId: string, descriptor: DeviceDescriptorDto): Promise<BoundDevice> {
    const ref = this.db.collection(COLLECTIONS.devices).doc(deviceDocId(descriptor.deviceId));

    const doc = await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);

      if (snapshot.exists) {
        const existing = snapshot.data() as DeviceDoc;
        if (existing.isActive && existing.userId !== userId) {
          throw new ConflictException({ code: AUTH_ERRORS.DEVICE_TAKEN });
        }
      }

      const now = Timestamp.now();
      const data: DeviceDoc = {
        userId,
        platform: descriptor.platform,
        model: descriptor.model,
        osVersion: descriptor.osVersion,
        appVersion: descriptor.appVersion,
        isActive: true,
        boundAt: now,
        lastSeenAt: now,
        revokedAt: null,
        revokedBy: null,
      };

      // Документ мог остаться от прошлого владельца после открепления —
      // перезаписываем его целиком, чтобы не тащить старые поля.
      tx.set(ref, data);
      return data;
    });

    return { ...doc, deviceId: descriptor.deviceId };
  }

  async findActiveBinding(userId: string): Promise<BoundDevice | null> {
    const found = await this.db
      .collection(COLLECTIONS.devices)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (found.empty) return null;
    const doc = found.docs[0];
    return { ...(doc.data() as DeviceDoc), deviceId: doc.id };
  }

  private async requestRebind(userId: string, descriptor: DeviceDescriptorDto): Promise<void> {
    const pending = await this.db
      .collection(COLLECTIONS.deviceRequests)
      .where('userId', '==', userId)
      .where('deviceId', '==', descriptor.deviceId)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();

    if (!pending.empty) return;

    const request: DeviceRequestDoc = {
      userId,
      deviceId: descriptor.deviceId,
      platform: descriptor.platform,
      model: descriptor.model,
      status: 'PENDING',
      createdAt: Timestamp.now(),
      resolvedAt: null,
      resolvedBy: null,
      resolveNote: null,
    };

    await this.db.collection(COLLECTIONS.deviceRequests).add(request);
  }

  /** Открепление активного устройства — доступно HR и супер-админу. */
  async unbind(userId: string, actorId: string): Promise<void> {
    const active = await this.findActiveBinding(userId);
    if (!active) throw new NotFoundException('У сотрудника нет привязанного устройства');

    const batch = this.db.batch();

    batch.update(this.db.collection(COLLECTIONS.devices).doc(deviceDocId(active.deviceId)), {
      isActive: false,
      revokedAt: Timestamp.now(),
      revokedBy: actorId,
    });

    batch.set(this.db.collection(COLLECTIONS.auditEvents).doc(), {
      actorId,
      action: 'device.unbind',
      targetType: 'User',
      targetId: userId,
      metadata: { deviceId: active.deviceId },
      ip: null,
      createdAt: Timestamp.now(),
    });

    await batch.commit();

    // Токены Firebase живут до часа, поэтому открепление должно погасить
    // и их — иначе сотрудник продолжит работать со старым токеном.
    await this.firebase.auth.revokeRefreshTokens(userId);
  }

  /** Одобрение заявки: старое устройство снимается, новое встаёт на его место. */
  async approveRequest(requestId: string, actorId: string, note?: string): Promise<BoundDevice> {
    const ref = this.db.collection(COLLECTIONS.deviceRequests).doc(requestId);
    const snapshot = await ref.get();

    if (!snapshot.exists) throw new NotFoundException('Заявка не найдена');
    const request = snapshot.data() as DeviceRequestDoc;
    if (request.status !== 'PENDING') {
      throw new ConflictException('Заявка уже обработана');
    }

    const active = await this.findActiveBinding(request.userId);
    if (active) await this.unbind(request.userId, actorId);

    const device = await this.bind(request.userId, {
      deviceId: request.deviceId,
      platform: request.platform,
      model: request.model,
    });

    await ref.update({
      status: 'APPROVED',
      resolvedAt: Timestamp.now(),
      resolvedBy: actorId,
      resolveNote: note ?? null,
    });

    return device;
  }

  async rejectRequest(requestId: string, actorId: string, note?: string): Promise<void> {
    await this.db.collection(COLLECTIONS.deviceRequests).doc(requestId).update({
      status: 'REJECTED',
      resolvedAt: Timestamp.now(),
      resolvedBy: actorId,
      resolveNote: note ?? null,
    });
  }

  /** Очередь заявок — рабочий экран HR. */
  async listPendingRequests(organizationId: string) {
    const snapshot = await this.db
      .collection(COLLECTIONS.deviceRequests)
      .where('status', '==', 'PENDING')
      .orderBy('createdAt', 'asc')
      .get();

    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as DeviceRequestDoc),
    }));

    if (requests.length === 0) return [];

    // Firestore не умеет join, поэтому сотрудников добираем отдельно
    // и отсеиваем чужие организации уже на сервере.
    const users = await this.db.getAll(
      ...requests.map((request) => this.db.collection(COLLECTIONS.users).doc(request.userId)),
    );

    const byId = new Map(
      users
        .filter((doc) => doc.exists)
        .map((doc) => [doc.id, doc.data() as UserDoc]),
    );

    return requests
      .filter((request) => byId.get(request.userId)?.organizationId === organizationId)
      .map((request) => {
        const user = byId.get(request.userId)!;
        return {
          ...request,
          user: {
            id: request.userId,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
          },
        };
      });
  }

  /** Счётчик необработанных заявок для значка в панели HR. */
  async countPendingRequests(): Promise<number> {
    const snapshot = await this.db
      .collection(COLLECTIONS.deviceRequests)
      .where('status', '==', 'PENDING')
      .count()
      .get();

    return snapshot.data().count;
  }
}
