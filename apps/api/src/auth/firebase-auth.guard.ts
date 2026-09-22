import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { UserDoc } from '../firestore/types';
import { DevicesService } from '../devices/devices.service';
import type { DeviceDescriptorDto } from './dto';

/**
 * Профиль сотрудника кешируется на короткий срок, чтобы каждый запрос
 * не стоил чтения из Firestore — там оплата поштучная.
 *
 * Кеш безопасен: увольнение и открепление устройства вызывают
 * revokeRefreshTokens, а проверка токена идёт с checkRevoked, поэтому
 * доступ закрывается немедленно, не дожидаясь истечения кеша.
 */
const PROFILE_CACHE_TTL_MS = 60_000;

interface CachedProfile {
  user: UserDoc;
  expiresAt: number;
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly profileCache = new Map<string, CachedProfile>();

  constructor(
    private readonly reflector: Reflector,
    private readonly firebase: FirebaseService,
    private readonly devices: DevicesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Не передан токен доступа');

    const decoded = await this.firebase.auth
      // checkRevoked обращается к Firebase и ловит отозванные токены сразу,
      // не дожидаясь истечения часа их жизни.
      .verifyIdToken(token, true)
      .catch(() => {
        throw new UnauthorizedException('Токен недействителен или отозван');
      });

    const user = await this.loadProfile(decoded.uid);
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Учётная запись неактивна');
    }

    // Главная проверка: Firebase выдаёт токен любому устройству, запрет
    // «один аккаунт — один телефон» держится только здесь.
    const descriptor = this.extractDevice(request);
    const device = await this.devices.resolveForRequest(decoded.uid, user, descriptor);

    const authenticated: AuthenticatedUser = {
      id: decoded.uid,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      officeId: user.officeId,
      deviceId: device?.deviceId ?? null,
    };

    (request as Request & { user: AuthenticatedUser }).user = authenticated;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim() || null;
  }

  /** Мобильный клиент представляет устройство заголовками на каждом запросе. */
  private extractDevice(request: Request): DeviceDescriptorDto | undefined {
    const deviceId = request.headers['x-device-id'];
    const platform = request.headers['x-device-platform'];

    if (typeof deviceId !== 'string' || !deviceId) return undefined;

    return {
      deviceId,
      platform: typeof platform === 'string' && platform ? platform : 'unknown',
      model: this.header(request, 'x-device-model'),
      osVersion: this.header(request, 'x-device-os'),
      appVersion: this.header(request, 'x-app-version'),
    };
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    return typeof value === 'string' && value ? value : undefined;
  }

  private async loadProfile(uid: string): Promise<UserDoc> {
    const cached = this.profileCache.get(uid);
    if (cached && cached.expiresAt > Date.now()) return cached.user;

    const snapshot = await this.firebase.firestore
      .collection(COLLECTIONS.users)
      .doc(uid)
      .get();

    if (!snapshot.exists) {
      throw new UnauthorizedException('Сотрудник не заведён в системе');
    }

    const user = snapshot.data() as UserDoc;
    this.profileCache.set(uid, { user, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
    return user;
  }
}
