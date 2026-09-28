import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizePhone } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, externalIdentityDocId } from '../firestore/collections';
import type { UserDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface WorkNumberLink {
  id: string;
  userId: string;
  fullName: string;
  provider: 'KCELL' | 'BITRIX';
  workNumber: string;
}

/**
 * Рабочие номера сотрудников.
 *
 * Номер в карточке — личный, и он не всегда совпадает с тем, с которого
 * сотрудник звонит клиентам. Сюда заводится именно рабочий: по нему
 * импорт раскладывает звонки из выгрузки оператора по людям.
 */
@Injectable()
export class WorkNumbersService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  async link(
    actor: AuthenticatedUser,
    userId: string,
    workNumber: string,
    provider: 'KCELL' | 'BITRIX',
  ): Promise<WorkNumberLink> {
    const normalized = normalizePhone(workNumber);
    if (!normalized) {
      throw new BadRequestException(`Не похоже на номер телефона: «${workNumber}»`);
    }

    const user = await this.loadUser(actor, userId);

    const id = externalIdentityDocId(provider, normalized);
    const ref = this.db.collection(COLLECTIONS.externalIdentities).doc(id);
    const existing = await ref.get();

    // Ключ документа — источник и номер, поэтому один рабочий номер
    // физически не может числиться за двумя сотрудниками.
    if (existing.exists) {
      const owner = (existing.data() as { userId: string }).userId;
      if (owner !== userId) {
        throw new ConflictException('Этот номер уже закреплён за другим сотрудником');
      }
    }

    await ref.set({ userId, provider, externalKey: normalized, organizationId: actor.organizationId });

    return { id, userId, fullName: user.fullName, provider, workNumber: normalized };
  }

  async unlink(actor: AuthenticatedUser, provider: 'KCELL' | 'BITRIX', workNumber: string): Promise<void> {
    const normalized = normalizePhone(workNumber);
    if (!normalized) throw new BadRequestException('Не похоже на номер телефона');

    const ref = this.db
      .collection(COLLECTIONS.externalIdentities)
      .doc(externalIdentityDocId(provider, normalized));

    const snapshot = await ref.get();
    if (!snapshot.exists) throw new NotFoundException('Привязка не найдена');

    const data = snapshot.data() as { organizationId?: string };
    if (data.organizationId !== actor.organizationId) {
      throw new NotFoundException('Привязка не найдена');
    }

    await ref.delete();
  }

  async list(actor: AuthenticatedUser): Promise<WorkNumberLink[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.externalIdentities)
      .where('organizationId', '==', actor.organizationId)
      .get();

    const links = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as { userId: string; provider: 'KCELL' | 'BITRIX'; externalKey: string }),
    }));

    if (links.length === 0) return [];

    const users = await this.db.getAll(
      ...links.map((link) => this.db.collection(COLLECTIONS.users).doc(link.userId)),
    );

    const names = new Map(
      users
        .filter((doc) => doc.exists)
        .map((doc) => [doc.id, (doc.data() as UserDoc).fullName]),
    );

    return links.map((link) => ({
      id: link.id,
      userId: link.userId,
      fullName: names.get(link.userId) ?? 'Сотрудник удалён',
      provider: link.provider,
      workNumber: link.externalKey,
    }));
  }

  private async loadUser(actor: AuthenticatedUser, userId: string): Promise<UserDoc> {
    const snapshot = await this.db.collection(COLLECTIONS.users).doc(userId).get();
    const user = snapshot.data() as UserDoc | undefined;

    if (!snapshot.exists || user?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Сотрудник не найден');
    }
    return user;
  }
}
