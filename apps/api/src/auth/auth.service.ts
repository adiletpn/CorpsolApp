import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { UserDoc } from '../firestore/types';
import { DevicesService } from '../devices/devices.service';
import type { DeviceDescriptorDto } from './dto';

export interface SessionProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  officeId: string | null;
  /** Идентификатор телефона, за которым закреплён аккаунт. */
  boundDeviceId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly devices: DevicesService,
  ) {}

  /**
   * Первый запрос после входа через Firebase Auth. Токен у клиента уже есть,
   * поэтому здесь не выдаются новые — здесь аккаунт закрепляется за телефоном
   * и возвращается прикладной профиль сотрудника.
   */
  async openSession(uid: string, descriptor?: DeviceDescriptorDto): Promise<SessionProfile> {
    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.users)
      .doc(uid)
      .get();

    if (!snapshot.exists) {
      throw new UnauthorizedException('Сотрудник не заведён в системе');
    }

    const user = snapshot.data() as UserDoc;
    const device = await this.devices.resolveForRequest(uid, user, descriptor);

    // Роль дублируется в claims токена: это позволит правилам безопасности
    // Firestore отсеивать явно чужие запросы, не обращаясь к базе.
    await this.syncRoleClaim(uid, user.role);

    return {
      id: uid,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      officeId: user.officeId,
      boundDeviceId: device?.deviceId ?? null,
    };
  }

  /** Выход: гасим токены Firebase, чтобы на устройстве не осталось доступа. */
  async closeSession(uid: string): Promise<void> {
    await this.firebase.auth.revokeRefreshTokens(uid);
  }

  private async syncRoleClaim(uid: string, role: Role): Promise<void> {
    const existing = await this.firebase.auth.getUser(uid);
    if (existing.customClaims?.role === role) return;

    await this.firebase.auth.setCustomUserClaims(uid, { role });
  }
}
