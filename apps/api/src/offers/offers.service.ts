import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { can } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { OfferDoc, OfferStatus, UserDoc } from '../firestore/types';
import { localWorkDateKey } from '../common/utils/time';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CreateOfferDto } from './dto';

export interface OfferView {
  id: string;
  userId: string;
  clientName: string;
  clientPhone: string | null;
  amountMinor: number;
  status: OfferStatus;
  sentDate: string;
  sentAt: string;
  resolvedAt: string | null;
}

@Injectable()
export class OffersService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.offers);
  }

  /**
   * Оффер заводит сам менеджер — и только на себя. Возможность выписать
   * сделку на чужое имя ломала бы и планы, и расчёт премий.
   */
  async create(actor: AuthenticatedUser, dto: CreateOfferDto): Promise<OfferView> {
    const user = await this.loadUser(actor.id);
    const now = new Date();

    const doc: OfferDoc = {
      userId: actor.id,
      organizationId: actor.organizationId,
      // Отдел копируется в документ: Firestore не умеет join, а выборка
      // по отделу нужна для общего плана.
      departmentId: user.departmentId,
      clientName: dto.clientName,
      clientPhone: dto.clientPhone ?? null,
      amountMinor: dto.amountMinor,
      status: 'SENT',
      sentAt: Timestamp.fromDate(now),
      sentDate: localWorkDateKey(now, 'Asia/Almaty'),
      resolvedAt: null,
    };

    const ref = await this.collection.add(doc);
    return this.toView(ref.id, doc);
  }

  /**
   * Решение по сделке. Отметить принятой может только руководитель:
   * принятый оффер закрывает план и влияет на премию автора.
   * Отказ и истечение автор проставляет сам — они ему невыгодны.
   */
  async resolve(
    actor: AuthenticatedUser,
    offerId: string,
    status: OfferStatus,
    note?: string,
  ): Promise<OfferView> {
    const { doc } = await this.loadVisible(actor, offerId);

    if (doc.status !== 'SENT') {
      throw new BadRequestException(`По сделке уже принято решение: ${doc.status}`);
    }

    if (status === 'ACCEPTED' && !can(actor.role, 'offer.confirm')) {
      throw new ForbiddenException('Подтвердить сделку может только руководитель');
    }
    if (status !== 'ACCEPTED' && doc.userId !== actor.id && !can(actor.role, 'offer.confirm')) {
      throw new ForbiddenException('Это чужая сделка');
    }

    const resolvedAt = Timestamp.now();
    await this.collection.doc(offerId).update({ status, resolvedAt });

    await this.firebase.firestore.collection(COLLECTIONS.auditEvents).doc().set({
      actorId: actor.id,
      action: `offer.${status.toLowerCase()}`,
      targetType: 'Offer',
      targetId: offerId,
      metadata: { note: note ?? null, amountMinor: doc.amountMinor },
      ip: null,
      createdAt: resolvedAt,
    });

    return this.toView(offerId, { ...doc, status, resolvedAt });
  }

  /** Офферы с учётом области видимости роли. */
  async list(actor: AuthenticatedUser, from?: string, to?: string): Promise<OfferView[]> {
    let query = this.collection.where('organizationId', '==', actor.organizationId);

    if (actor.role === 'MOP') {
      query = query.where('userId', '==', actor.id);
    } else if (actor.role === 'ROP') {
      if (!actor.departmentId) throw new ForbiddenException('РОП не привязан к отделу');
      query = query.where('departmentId', '==', actor.departmentId);
    }

    if (from) query = query.where('sentDate', '>=', from);
    if (to) query = query.where('sentDate', '<=', to);

    const snapshot = await query.get();

    return snapshot.docs
      .map((doc) => this.toView(doc.id, doc.data() as OfferDoc))
      .sort((a, b) => b.sentDate.localeCompare(a.sentDate));
  }

  private async loadVisible(
    actor: AuthenticatedUser,
    offerId: string,
  ): Promise<{ doc: OfferDoc }> {
    const snapshot = await this.collection.doc(offerId).get();
    const doc = snapshot.data() as OfferDoc | undefined;

    if (!snapshot.exists || doc?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Сделка не найдена');
    }
    if (actor.role === 'ROP' && doc.departmentId !== actor.departmentId) {
      throw new ForbiddenException('Сделка не из вашего отдела');
    }
    if (actor.role === 'MOP' && doc.userId !== actor.id) {
      throw new ForbiddenException('Это чужая сделка');
    }

    return { doc };
  }

  private async loadUser(userId: string): Promise<UserDoc> {
    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.users)
      .doc(userId)
      .get();

    if (!snapshot.exists) throw new NotFoundException('Сотрудник не найден');
    return snapshot.data() as UserDoc;
  }

  private toView(id: string, doc: OfferDoc): OfferView {
    return {
      id,
      userId: doc.userId,
      clientName: doc.clientName,
      clientPhone: doc.clientPhone,
      amountMinor: doc.amountMinor,
      status: doc.status,
      sentDate: doc.sentDate,
      sentAt: doc.sentAt.toDate().toISOString(),
      resolvedAt: doc.resolvedAt?.toDate().toISOString() ?? null,
    };
  }
}
