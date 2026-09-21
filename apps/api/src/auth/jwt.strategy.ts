import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@corpsol/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { AccessTokenPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Токен живёт 15 минут, поэтому одной подписи мало: увольнение сотрудника
   * и открепление устройства должны действовать немедленно.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true, device: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Сессия недействительна');
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Учётная запись неактивна');
    }
    if (session.device && !session.device.isActive) {
      throw new UnauthorizedException('Устройство откреплено от аккаунта');
    }

    return {
      id: session.user.id,
      organizationId: session.user.organizationId,
      email: session.user.email,
      role: session.user.role as Role,
      departmentId: session.user.departmentId,
      officeId: session.user.officeId,
      deviceId: session.device?.id ?? null,
    };
  }
}
