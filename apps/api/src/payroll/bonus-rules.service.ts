import { BadRequestException, Injectable } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { BonusRuleDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CreateBonusRuleDto } from './dto';

/** Правила, которые без метрики не имеют смысла. */
const METRIC_REQUIRED: BonusRuleDoc['kind'][] = ['PLAN_COMPLETION', 'PER_UNIT'];

@Injectable()
export class BonusRulesService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.bonusRules);
  }

  async create(actor: AuthenticatedUser, dto: CreateBonusRuleDto) {
    if (METRIC_REQUIRED.includes(dto.kind) && !dto.metric) {
      throw new BadRequestException(`Для правила ${dto.kind} нужно указать метрику`);
    }
    if (dto.amountMinor === 0 && dto.percentBps === 0) {
      // Правило без суммы молча ничего не делает — такое лучше не заводить,
      // чем потом искать, почему премия не начислилась.
      throw new BadRequestException('Правило без суммы и без процента не действует');
    }

    const doc: BonusRuleDoc = {
      organizationId: actor.organizationId,
      departmentId: dto.departmentId ?? null,
      kind: dto.kind,
      metric: dto.metric ?? null,
      threshold: dto.threshold,
      amountMinor: dto.amountMinor,
      percentBps: dto.percentBps,
      isActive: dto.isActive ?? true,
      createdAt: Timestamp.now(),
    };

    const ref = await this.collection.add(doc);
    return { id: ref.id, ...doc, createdAt: doc.createdAt.toDate().toISOString() };
  }

  async list(actor: AuthenticatedUser) {
    const snapshot = await this.collection
      .where('organizationId', '==', actor.organizationId)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as BonusRuleDoc;
      return { id: doc.id, ...data, createdAt: data.createdAt.toDate().toISOString() };
    });
  }

  async setActive(actor: AuthenticatedUser, ruleId: string, isActive: boolean) {
    const snapshot = await this.collection.doc(ruleId).get();
    const data = snapshot.data() as BonusRuleDoc | undefined;

    if (!snapshot.exists || data?.organizationId !== actor.organizationId) {
      throw new BadRequestException('Правило не найдено');
    }

    await this.collection.doc(ruleId).update({ isActive });
    return { id: ruleId, isActive };
  }
}
