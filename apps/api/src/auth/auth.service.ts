import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Device, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { AUTH_ERRORS } from './auth.errors';
import type { LoginDto } from './dto';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  organizationId: string;
  departmentId: string | null;
  officeId: string | null;
  /** Внутренний id привязки, а не аппаратный идентификатор телефона. */
  deviceId: string | null;
  sessionId: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    departmentId: string | null;
    officeId: string | null;
  };
}

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly devices: DevicesService,
  ) {}

  async login(dto: LoginDto, ctx: RequestContext = {}): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    // Сверяем пароль даже при отсутствии пользователя, чтобы время ответа
    // не выдавало существование email.
    const passwordHash = user?.passwordHash ?? (await this.dummyHash());
    const passwordValid = await argon2.verify(passwordHash, dto.password).catch(() => false);

    if (!user || !passwordValid) {
      throw new UnauthorizedException({ code: AUTH_ERRORS.INVALID_CREDENTIALS });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({ code: AUTH_ERRORS.EMPLOYEE_INACTIVE });
    }

    const device = await this.devices.resolveForLogin(user, dto.device);
    return this.issueSession(user, device, ctx);
  }

  async refresh(refreshToken: string, ctx: RequestContext = {}): Promise<LoginResult> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: true, device: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: AUTH_ERRORS.REFRESH_INVALID });
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({ code: AUTH_ERRORS.EMPLOYEE_INACTIVE });
    }
    // Устройство могли открепить, пока refresh-токен был на руках.
    if (session.device && !session.device.isActive) {
      throw new ForbiddenException({ code: AUTH_ERRORS.DEVICE_MISMATCH });
    }

    // Ротация: старая сессия гасится, выдаётся новая пара токенов.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(session.user, session.device, ctx);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    user: User,
    device: Device | null,
    ctx: RequestContext,
  ): Promise<LoginResult> {
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        deviceId: device?.id ?? null,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });

    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      officeId: user.officeId,
      deviceId: device?.id ?? null,
      sessionId: session.id,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL') ?? '15m',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        departmentId: user.departmentId,
        officeId: user.officeId,
      },
    };
  }

  private dummyHashCache: string | null = null;

  /** Хеш-заглушка для постоянного времени ответа на несуществующий email. */
  private async dummyHash(): Promise<string> {
    this.dummyHashCache ??= await argon2.hash(randomBytes(32).toString('hex'));
    return this.dummyHashCache;
  }
}
