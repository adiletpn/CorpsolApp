import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ROLE_PERMISSIONS } from '@corpsol/shared';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request) {
    const sessionId = (req.user as { sessionId?: string })?.sessionId;
    if (sessionId) await this.auth.logout(sessionId);
  }

  /** Профиль и полный список прав — клиент строит по нему меню. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { ...user, permissions: ROLE_PERMISSIONS[user.role] };
  }
}
