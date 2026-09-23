import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { canAssignRole, canManageEmployee, type Role } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { UserDoc } from '../firestore/types';
import { DevicesService } from '../devices/devices.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CreateEmployeeDto, UpdateEmployeeDto } from './dto';

export interface EmployeeView {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserDoc['status'];
  departmentId: string | null;
  officeId: string | null;
  phone: string | null;
  baseSalaryMinor: number;
  hiredAt: string;
  terminatedAt: string | null;
}

/** Пароль выдаётся один раз при заведении и меняется сотрудником при входе. */
function generateTemporaryPassword(): string {
  return `${randomBytes(9).toString('base64url')}aA1!`;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly devices: DevicesService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Заведение сотрудника: учётка в Firebase Auth плюс карточка в базе.
   * Роль проверяется отдельно от права на действие — иначе ЧР, которому
   * положено заводить менеджеров, мог бы создать супер-админа.
   */
  async create(
    actor: AuthenticatedUser,
    dto: CreateEmployeeDto,
  ): Promise<EmployeeView & { temporaryPassword: string }> {
    if (!canAssignRole(actor.role, dto.role)) {
      throw new ForbiddenException(`Роль ${actor.role} не вправе выдавать роль ${dto.role}`);
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.firebase.auth.getUserByEmail(email).catch(() => null);
    if (existing) {
      throw new ConflictException('Сотрудник с таким email уже заведён');
    }

    await this.assertReferencesBelongToOrg(actor.organizationId, dto.departmentId, dto.officeId);

    const temporaryPassword = generateTemporaryPassword();
    const created = await this.firebase.auth.createUser({
      email,
      password: temporaryPassword,
      displayName: dto.fullName,
    });

    // Роль дублируется в claims токена: правила безопасности Firestore
    // читают её оттуда, не обращаясь к базе.
    await this.firebase.auth.setCustomUserClaims(created.uid, { role: dto.role });

    const now = Timestamp.now();
    const doc: UserDoc = {
      organizationId: actor.organizationId,
      email,
      phone: dto.phone,
      fullName: dto.fullName,
      role: dto.role,
      status: 'ACTIVE',
      departmentId: dto.departmentId ?? null,
      officeId: dto.officeId ?? null,
      hiredAt: now,
      terminatedAt: null,
      baseSalaryMinor: dto.baseSalaryMinor ?? 0,
      currency: 'KZT',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.db.collection(COLLECTIONS.users).doc(created.uid).create(doc);
    } catch (cause) {
      // Учётка уже создана, а карточка — нет. Оставлять «призрака»,
      // который может войти, но не существует в системе, нельзя.
      await this.firebase.auth.deleteUser(created.uid).catch(() => undefined);
      throw cause;
    }

    await this.audit(actor.id, 'employee.create', created.uid, { role: dto.role });

    return { ...this.toView(created.uid, doc), temporaryPassword };
  }

  async update(actor: AuthenticatedUser, userId: string, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    const { doc } = await this.loadManageable(actor, userId);

    if (dto.role && dto.role !== doc.role) {
      if (!canAssignRole(actor.role, dto.role)) {
        throw new ForbiddenException(`Роль ${actor.role} не вправе выдавать роль ${dto.role}`);
      }
      await this.firebase.auth.setCustomUserClaims(userId, { role: dto.role });
    }

    await this.assertReferencesBelongToOrg(actor.organizationId, dto.departmentId, dto.officeId);

    const patch = {
      ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
      ...(dto.officeId !== undefined ? { officeId: dto.officeId } : {}),
      ...(dto.baseSalaryMinor !== undefined ? { baseSalaryMinor: dto.baseSalaryMinor } : {}),
      updatedAt: Timestamp.now(),
    };

    await this.db.collection(COLLECTIONS.users).doc(userId).update(patch);
    await this.audit(actor.id, 'employee.update', userId, { fields: Object.keys(patch) });

    return this.toView(userId, { ...doc, ...patch } as UserDoc);
  }

  /**
   * Увольнение. Карточка сохраняется — на ней держатся табель, расчёты
   * и история, — но доступ закрывается полностью и немедленно.
   */
  async terminate(actor: AuthenticatedUser, userId: string, reason?: string): Promise<void> {
    if (actor.id === userId) {
      throw new BadRequestException('Нельзя уволить самого себя');
    }

    const { doc } = await this.loadManageable(actor, userId);
    if (doc.status === 'TERMINATED') {
      throw new ConflictException('Сотрудник уже уволен');
    }

    const now = Timestamp.now();
    await this.db.collection(COLLECTIONS.users).doc(userId).update({
      status: 'TERMINATED',
      terminatedAt: now,
      updatedAt: now,
    });

    // Блокировка учётки и отзыв токенов закрывают доступ сразу,
    // не дожидаясь истечения выданного ранее токена.
    await this.firebase.auth.updateUser(userId, { disabled: true });
    await this.firebase.auth.revokeRefreshTokens(userId);

    // Телефон освобождается: его можно будет закрепить за другим сотрудником.
    await this.devices.unbind(userId, actor.id).catch(() => undefined);

    await this.audit(actor.id, 'employee.terminate', userId, { reason: reason ?? null });
  }

  /** Список сотрудников с учётом области видимости роли. */
  async list(actor: AuthenticatedUser, includeTerminated = false): Promise<EmployeeView[]> {
    let query = this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', actor.organizationId);

    if (actor.role === 'ROP') {
      if (!actor.departmentId) throw new ForbiddenException('РОП не привязан к отделу');
      query = query.where('departmentId', '==', actor.departmentId);
    }

    const snapshot = await query.get();
    return snapshot.docs
      .map((item) => this.toView(item.id, item.data() as UserDoc))
      .filter((item) => includeTerminated || item.status !== 'TERMINATED')
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }

  async findOne(actor: AuthenticatedUser, userId: string): Promise<EmployeeView> {
    const doc = await this.load(userId);
    if (doc.organizationId !== actor.organizationId) {
      throw new NotFoundException('Сотрудник не найден');
    }
    if (actor.role === 'ROP' && doc.departmentId !== actor.departmentId) {
      throw new ForbiddenException('Сотрудник не из вашего отдела');
    }
    return this.toView(userId, doc);
  }

  private async load(userId: string): Promise<UserDoc> {
    const snapshot = await this.db.collection(COLLECTIONS.users).doc(userId).get();
    if (!snapshot.exists) throw new NotFoundException('Сотрудник не найден');
    return snapshot.data() as UserDoc;
  }

  /** Загружает сотрудника и проверяет, что актор вправе им управлять. */
  private async loadManageable(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<{ doc: UserDoc }> {
    const doc = await this.load(userId);

    if (doc.organizationId !== actor.organizationId) {
      throw new NotFoundException('Сотрудник не найден');
    }
    if (!canManageEmployee(actor.role, doc.role)) {
      throw new ForbiddenException(`Роль ${actor.role} не вправе управлять сотрудником с ролью ${doc.role}`);
    }

    return { doc };
  }

  /** Отдел и офис должны принадлежать той же организации. */
  private async assertReferencesBelongToOrg(
    organizationId: string,
    departmentId?: string,
    officeId?: string,
  ): Promise<void> {
    const checks: Array<Promise<void>> = [];

    if (departmentId) {
      checks.push(
        this.db
          .collection(COLLECTIONS.departments)
          .doc(departmentId)
          .get()
          .then((snapshot) => {
            const data = snapshot.data() as { organizationId?: string } | undefined;
            if (!snapshot.exists || data?.organizationId !== organizationId) {
              throw new BadRequestException('Отдел не найден в вашей организации');
            }
          }),
      );
    }

    if (officeId) {
      checks.push(
        this.db
          .collection(COLLECTIONS.offices)
          .doc(officeId)
          .get()
          .then((snapshot) => {
            const data = snapshot.data() as { organizationId?: string } | undefined;
            if (!snapshot.exists || data?.organizationId !== organizationId) {
              throw new BadRequestException('Офис не найден в вашей организации');
            }
          }),
      );
    }

    await Promise.all(checks);
  }

  private toView(id: string, doc: UserDoc): EmployeeView {
    return {
      id,
      email: doc.email,
      fullName: doc.fullName,
      role: doc.role,
      status: doc.status,
      departmentId: doc.departmentId,
      officeId: doc.officeId,
      phone: doc.phone ?? null,
      baseSalaryMinor: doc.baseSalaryMinor,
      hiredAt: doc.hiredAt.toDate().toISOString(),
      terminatedAt: doc.terminatedAt?.toDate().toISOString() ?? null,
    };
  }

  private async audit(
    actorId: string,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      actorId,
      action,
      targetType: 'User',
      targetId,
      metadata,
      ip: null,
      createdAt: Timestamp.now(),
    });
  }
}
