import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { DepartmentDoc, UserDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CreateDepartmentDto, UpdateDepartmentDto } from './dto';

export interface DepartmentView {
  id: string;
  name: string;
  head: { id: string; fullName: string } | null;
  memberCount: number;
}

@Injectable()
export class DepartmentsService {
  constructor(private readonly firebase: FirebaseService) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.departments);
  }

  async create(actor: AuthenticatedUser, dto: CreateDepartmentDto): Promise<DepartmentView> {
    if (dto.headId) await this.assertCanLead(actor, dto.headId);

    const doc: DepartmentDoc = {
      organizationId: actor.organizationId,
      name: dto.name,
      headId: dto.headId ?? null,
    };

    const ref = await this.collection.add(doc);

    // Руководитель должен состоять в отделе, которым руководит, иначе
    // его собственные отметки и показатели не попадут в отчёты отдела.
    if (dto.headId) await this.attachToDepartment(dto.headId, ref.id);

    return this.buildView(ref.id, doc);
  }

  async update(
    actor: AuthenticatedUser,
    departmentId: string,
    dto: UpdateDepartmentDto,
  ): Promise<DepartmentView> {
    const current = await this.loadOwned(actor, departmentId);

    if (dto.headId !== undefined && dto.headId !== current.headId) {
      if (dto.headId) await this.assertCanLead(actor, dto.headId);
    }

    const patch = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.headId !== undefined ? { headId: dto.headId || null } : {}),
    };

    await this.collection.doc(departmentId).update(patch);

    if (dto.headId) await this.attachToDepartment(dto.headId, departmentId);

    return this.buildView(departmentId, { ...current, ...patch });
  }

  async list(actor: AuthenticatedUser): Promise<DepartmentView[]> {
    const snapshot = await this.collection
      .where('organizationId', '==', actor.organizationId)
      .get();

    const views = await Promise.all(
      snapshot.docs.map((doc) => this.buildView(doc.id, doc.data() as DepartmentDoc)),
    );

    return views.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async findOne(actor: AuthenticatedUser, departmentId: string): Promise<DepartmentView> {
    const doc = await this.loadOwned(actor, departmentId);
    return this.buildView(departmentId, doc);
  }

  /**
   * Руководителем отдела может быть только РОП. Назначение менеджера
   * сломало бы область видимости: права РОПа выдаются по роли, и человек
   * числился бы главой отдела, не видя ни отдела, ни его показателей.
   */
  private async assertCanLead(actor: AuthenticatedUser, headId: string): Promise<void> {
    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.users)
      .doc(headId)
      .get();

    const user = snapshot.data() as UserDoc | undefined;
    if (!snapshot.exists || user?.organizationId !== actor.organizationId) {
      throw new BadRequestException('Сотрудник не найден в вашей организации');
    }
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Нельзя назначить руководителем неактивного сотрудника');
    }
    if (user.role !== 'ROP') {
      throw new BadRequestException(
        `Руководителем отдела может быть только РОП, а у сотрудника роль ${user.role}`,
      );
    }
  }

  private async attachToDepartment(userId: string, departmentId: string): Promise<void> {
    await this.firebase.firestore
      .collection(COLLECTIONS.users)
      .doc(userId)
      .update({ departmentId, updatedAt: Timestamp.now() });
  }

  private async loadOwned(
    actor: AuthenticatedUser,
    departmentId: string,
  ): Promise<DepartmentDoc> {
    const snapshot = await this.collection.doc(departmentId).get();
    const doc = snapshot.data() as DepartmentDoc | undefined;

    if (!snapshot.exists || doc?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Отдел не найден');
    }
    return doc;
  }

  private async buildView(id: string, doc: DepartmentDoc): Promise<DepartmentView> {
    const users = this.firebase.firestore.collection(COLLECTIONS.users);

    const [headSnapshot, members] = await Promise.all([
      doc.headId ? users.doc(doc.headId).get() : Promise.resolve(null),
      users
        .where('departmentId', '==', id)
        .where('status', '==', 'ACTIVE')
        .count()
        .get(),
    ]);

    const head = headSnapshot?.exists ? (headSnapshot.data() as UserDoc) : null;

    return {
      id,
      name: doc.name,
      head: head && doc.headId ? { id: doc.headId, fullName: head.fullName } : null,
      memberCount: members.data().count,
    };
  }
}
