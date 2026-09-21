import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, DeviceRequestStatus, Prisma, Role, User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AUTH_ERRORS } from '../auth/auth.errors';
import type { DeviceDescriptorDto } from '../auth/dto';

/**
 * Роли, работающие «в поле»: для них аккаунт жёстко привязан к одному телефону.
 * Руководители заходят в веб-панель с любого браузера.
 */
const DEVICE_BOUND_ROLES: Role[] = [Role.MOP, Role.ROP];

export function requiresBoundDevice(role: Role): boolean {
  return DEVICE_BOUND_ROLES.includes(role);
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Сопоставляет предъявленное устройство с привязкой аккаунта.
   * Возвращает активную привязку либо бросает ошибку с кодом причины.
   */
  async resolveForLogin(user: User, descriptor?: DeviceDescriptorDto): Promise<Device | null> {
    if (!descriptor) {
      if (requiresBoundDevice(user.role)) {
        throw new ForbiddenException({ code: AUTH_ERRORS.DEVICE_REQUIRED });
      }
      return null;
    }

    const existing = await this.prisma.device.findUnique({
      where: { deviceId: descriptor.deviceId },
    });

    // Телефон уже закреплён за другим сотрудником — это и есть попытка «прикрыть» коллегу.
    if (existing && existing.userId !== user.id && existing.isActive) {
      throw new ConflictException({ code: AUTH_ERRORS.DEVICE_TAKEN });
    }

    if (existing && existing.userId === user.id && existing.isActive) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          model: descriptor.model ?? existing.model,
          osVersion: descriptor.osVersion ?? existing.osVersion,
          appVersion: descriptor.appVersion ?? existing.appVersion,
        },
      });
    }

    const activeBinding = await this.prisma.device.findFirst({
      where: { userId: user.id, isActive: true },
    });

    // Аккаунт уже занят другим телефоном — нужен явный аппрув HR.
    if (activeBinding) {
      await this.requestRebind(user.id, descriptor);
      throw new ForbiddenException({ code: AUTH_ERRORS.DEVICE_MISMATCH });
    }

    return this.bind(user.id, descriptor);
  }

  /** Первичная привязка: аккаунт свободен, телефон ни за кем не закреплён. */
  async bind(userId: string, descriptor: DeviceDescriptorDto): Promise<Device> {
    const data: Prisma.DeviceUncheckedCreateInput = {
      userId,
      deviceId: descriptor.deviceId,
      platform: descriptor.platform,
      model: descriptor.model,
      osVersion: descriptor.osVersion,
      appVersion: descriptor.appVersion,
      isActive: true,
    };

    return this.prisma.device.upsert({
      where: { deviceId: descriptor.deviceId },
      create: data,
      // Запись могла остаться от прошлого владельца после открепления — переиспользуем её.
      update: { ...data, boundAt: new Date(), revokedAt: null, revokedBy: null },
    });
  }

  private async requestRebind(userId: string, descriptor: DeviceDescriptorDto): Promise<void> {
    const pending = await this.prisma.deviceBindingRequest.findFirst({
      where: { userId, deviceId: descriptor.deviceId, status: DeviceRequestStatus.PENDING },
    });
    if (pending) return;

    await this.prisma.deviceBindingRequest.create({
      data: {
        userId,
        deviceId: descriptor.deviceId,
        platform: descriptor.platform,
        model: descriptor.model,
      },
    });
  }

  /** Открепление активного устройства — доступно HR и супер-админу. */
  async unbind(userId: string, actorId: string): Promise<void> {
    const active = await this.prisma.device.findFirst({
      where: { userId, isActive: true },
    });
    if (!active) throw new NotFoundException('У сотрудника нет привязанного устройства');

    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: active.id },
        data: { isActive: false, revokedAt: new Date(), revokedBy: actorId },
      }),
      // Сессии этого устройства должны умереть вместе с привязкой.
      this.prisma.session.updateMany({
        where: { deviceId: active.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          actorId,
          action: 'device.unbind',
          targetType: 'User',
          targetId: userId,
          metadata: { deviceId: active.deviceId },
        },
      }),
    ]);
  }

  /** Одобрение заявки на перепривязку: старое устройство снимается, новое встаёт. */
  async approveRequest(requestId: string, actorId: string, note?: string): Promise<Device> {
    const request = await this.prisma.deviceBindingRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== DeviceRequestStatus.PENDING) {
      throw new NotFoundException('Заявка не найдена или уже обработана');
    }

    const active = await this.prisma.device.findFirst({
      where: { userId: request.userId, isActive: true },
    });
    if (active) await this.unbind(request.userId, actorId);

    const device = await this.bind(request.userId, {
      deviceId: request.deviceId,
      platform: request.platform,
      model: request.model ?? undefined,
    });

    await this.prisma.deviceBindingRequest.update({
      where: { id: requestId },
      data: {
        status: DeviceRequestStatus.APPROVED,
        resolvedAt: new Date(),
        resolvedBy: actorId,
        resolveNote: note,
      },
    });

    return device;
  }

  async rejectRequest(requestId: string, actorId: string, note?: string): Promise<void> {
    await this.prisma.deviceBindingRequest.update({
      where: { id: requestId },
      data: {
        status: DeviceRequestStatus.REJECTED,
        resolvedAt: new Date(),
        resolvedBy: actorId,
        resolveNote: note,
      },
    });
  }

  listPendingRequests(organizationId: string) {
    return this.prisma.deviceBindingRequest.findMany({
      where: { status: DeviceRequestStatus.PENDING, user: { organizationId } },
      include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
