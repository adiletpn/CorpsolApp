import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { OfficeDoc, TerminalDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TerminalService } from './terminal.service';

/**
 * Терминал в представлении администратора. Секрет подписи и хеш токена
 * не отдаются наружу никогда — вместо них только признак, выпущен ли токен.
 */
export interface TerminalView {
  id: string;
  officeId: string;
  name: string;
  isActive: boolean;
  hasAccessToken: boolean;
  tokenIssuedAt: string | null;
  createdAt: string;
}

@Injectable()
export class TerminalsService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.terminals);
  }

  async create(actor: AuthenticatedUser, officeId: string, name: string): Promise<TerminalView> {
    await this.assertOfficeOwned(actor, officeId);

    const doc: TerminalDoc = {
      officeId,
      name,
      // Секрет генерируется здесь и остаётся на сервере: только поэтому
      // валидный QR нельзя собрать заранее или за пределами офиса.
      secret: TerminalService.generateSecret(),
      isActive: true,
      accessTokenHash: null,
      tokenIssuedAt: null,
      createdAt: Timestamp.now(),
    };

    const ref = await this.collection.add(doc);
    return this.toView(ref.id, doc);
  }

  async setActive(
    actor: AuthenticatedUser,
    terminalId: string,
    isActive: boolean,
  ): Promise<TerminalView> {
    const doc = await this.loadOwned(actor, terminalId);

    await this.collection.doc(terminalId).update({ isActive });
    return this.toView(terminalId, { ...doc, isActive });
  }

  async list(actor: AuthenticatedUser, officeId?: string): Promise<TerminalView[]> {
    const offices = await this.firebase.firestore
      .collection(COLLECTIONS.offices)
      .where('organizationId', '==', actor.organizationId)
      .get();

    const ownedOfficeIds = new Set(offices.docs.map((doc) => doc.id));
    if (officeId && !ownedOfficeIds.has(officeId)) {
      throw new NotFoundException('Офис не найден');
    }

    const snapshot = await this.collection.get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as TerminalDoc }))
      // Firestore не умеет join, поэтому чужие организации отсеиваем здесь.
      .filter(({ data }) => ownedOfficeIds.has(data.officeId))
      .filter(({ data }) => !officeId || data.officeId === officeId)
      .map(({ id, data }) => this.toView(id, data))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  private async loadOwned(actor: AuthenticatedUser, terminalId: string): Promise<TerminalDoc> {
    const snapshot = await this.collection.doc(terminalId).get();
    if (!snapshot.exists) throw new NotFoundException('Терминал не найден');

    const doc = snapshot.data() as TerminalDoc;
    await this.assertOfficeOwned(actor, doc.officeId);
    return doc;
  }

  private async assertOfficeOwned(actor: AuthenticatedUser, officeId: string): Promise<void> {
    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.offices)
      .doc(officeId)
      .get();

    const office = snapshot.data() as OfficeDoc | undefined;
    if (!snapshot.exists || office?.organizationId !== actor.organizationId) {
      throw new BadRequestException('Офис не найден в вашей организации');
    }
  }

  private toView(id: string, doc: TerminalDoc): TerminalView {
    return {
      id,
      officeId: doc.officeId,
      name: doc.name,
      isActive: doc.isActive,
      hasAccessToken: doc.accessTokenHash !== null,
      tokenIssuedAt: doc.tokenIssuedAt?.toDate().toISOString() ?? null,
      createdAt: doc.createdAt.toDate().toISOString(),
    };
  }
}
