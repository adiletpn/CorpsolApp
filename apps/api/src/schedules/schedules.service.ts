import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { DepartmentDoc, UserDoc, WorkScheduleDoc } from '../firestore/types';
import { parseHhMm } from '../common/utils/time';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CreateScheduleDto } from './dto';

export interface ScheduleView {
  id: string;
  departmentId: string | null;
  userId: string | null;
  /** Кому принадлежит график — имя отдела или сотрудника. */
  ownerName: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  workdays: number[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

const DEFAULT_GRACE_MINUTES = 5;

@Injectable()
export class SchedulesService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  private get collection() {
    return this.db.collection(COLLECTIONS.workSchedules);
  }

  async create(actor: AuthenticatedUser, dto: CreateScheduleDto): Promise<ScheduleView> {
    const owner = await this.resolveOwner(actor, dto);

    if (parseHhMm(dto.endTime) <= parseHhMm(dto.startTime)) {
      // Ночные смены через полночь пока не поддержаны: расчёт опоздания
      // считает минуты от начала суток и на таком графике соврал бы.
      throw new BadRequestException(
        'Конец смены должен быть позже начала. Ночные смены через полночь пока не поддерживаются.',
      );
    }

    // По умолчанию график действует с начала года: иначе правка табеля
    // за прошедшие дни не нашла бы графика и не смогла определить опоздание.
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException('Конец действия графика раньше его начала');
    }

    const doc: WorkScheduleDoc = {
      departmentId: dto.departmentId ?? null,
      userId: dto.userId ?? null,
      startTime: dto.startTime,
      endTime: dto.endTime,
      graceMinutes: dto.graceMinutes ?? DEFAULT_GRACE_MINUTES,
      // Дни недели без повторов и по порядку — так их проще читать в отчётах.
      workdays: [...new Set(dto.workdays)].sort((a, b) => a - b),
      effectiveFrom: Timestamp.fromDate(effectiveFrom),
      effectiveTo: effectiveTo ? Timestamp.fromDate(effectiveTo) : null,
    };

    const ref = await this.collection.add(doc);
    return this.toView(ref.id, doc, owner.name);
  }

  async list(actor: AuthenticatedUser): Promise<ScheduleView[]> {
    const [schedules, departments, users] = await Promise.all([
      this.collection.get(),
      this.db
        .collection(COLLECTIONS.departments)
        .where('organizationId', '==', actor.organizationId)
        .get(),
      this.db
        .collection(COLLECTIONS.users)
        .where('organizationId', '==', actor.organizationId)
        .get(),
    ]);

    const departmentNames = new Map(
      departments.docs.map((doc) => [doc.id, (doc.data() as DepartmentDoc).name]),
    );
    const userNames = new Map(
      users.docs.map((doc) => [doc.id, (doc.data() as UserDoc).fullName]),
    );

    return schedules.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as WorkScheduleDoc }))
      // Firestore не умеет join, поэтому чужие организации отсеиваем здесь.
      .filter(({ data }) =>
        data.userId
          ? userNames.has(data.userId)
          : data.departmentId
            ? departmentNames.has(data.departmentId)
            : false,
      )
      .map(({ id, data }) =>
        this.toView(
          id,
          data,
          data.userId
            ? (userNames.get(data.userId) ?? '')
            : (departmentNames.get(data.departmentId ?? '') ?? ''),
        ),
      )
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'ru'));
  }

  async remove(actor: AuthenticatedUser, scheduleId: string): Promise<void> {
    const snapshot = await this.collection.doc(scheduleId).get();
    if (!snapshot.exists) throw new NotFoundException('График не найден');

    const doc = snapshot.data() as WorkScheduleDoc;
    await this.assertOwnedByOrganization(actor, doc);

    await this.collection.doc(scheduleId).delete();
  }

  /** График принадлежит либо отделу, либо сотруднику, но не обоим сразу. */
  private async resolveOwner(
    actor: AuthenticatedUser,
    dto: CreateScheduleDto,
  ): Promise<{ name: string }> {
    if (Boolean(dto.departmentId) === Boolean(dto.userId)) {
      throw new BadRequestException(
        'Укажите либо отдел, либо сотрудника — график не может быть одновременно общим и личным',
      );
    }

    if (dto.userId) {
      const snapshot = await this.db.collection(COLLECTIONS.users).doc(dto.userId).get();
      const user = snapshot.data() as UserDoc | undefined;

      if (!snapshot.exists || user?.organizationId !== actor.organizationId) {
        throw new BadRequestException('Сотрудник не найден в вашей организации');
      }
      return { name: user.fullName };
    }

    const snapshot = await this.db
      .collection(COLLECTIONS.departments)
      .doc(dto.departmentId!)
      .get();
    const department = snapshot.data() as DepartmentDoc | undefined;

    if (!snapshot.exists || department?.organizationId !== actor.organizationId) {
      throw new BadRequestException('Отдел не найден в вашей организации');
    }
    return { name: department.name };
  }

  private async assertOwnedByOrganization(
    actor: AuthenticatedUser,
    doc: WorkScheduleDoc,
  ): Promise<void> {
    const collection = doc.userId ? COLLECTIONS.users : COLLECTIONS.departments;
    const id = doc.userId ?? doc.departmentId;
    if (!id) throw new NotFoundException('График не найден');

    const snapshot = await this.db.collection(collection).doc(id).get();
    const data = snapshot.data() as { organizationId?: string } | undefined;

    if (!snapshot.exists || data?.organizationId !== actor.organizationId) {
      throw new NotFoundException('График не найден');
    }
  }

  private toView(id: string, doc: WorkScheduleDoc, ownerName: string): ScheduleView {
    return {
      id,
      departmentId: doc.departmentId,
      userId: doc.userId,
      ownerName,
      startTime: doc.startTime,
      endTime: doc.endTime,
      graceMinutes: doc.graceMinutes,
      workdays: doc.workdays,
      effectiveFrom: doc.effectiveFrom.toDate().toISOString(),
      effectiveTo: doc.effectiveTo?.toDate().toISOString() ?? null,
    };
  }
}
