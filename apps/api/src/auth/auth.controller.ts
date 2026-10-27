import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '@corpsol/shared';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { OpenSessionDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Вызывается сразу после входа через Firebase Auth. Токен клиент получает
   * от Firebase самостоятельно, здесь аккаунт закрепляется за телефоном.
   */
  @Post('session')
  @HttpCode(200)
  openSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenSessionDto) {
    // Мини-апп устройство в теле не шлёт: его аккаунт Telegram уже проверен
    // и закреплён защитой запроса по подписанной строке запуска.
    const device =
      dto.device ??
      (user.deviceId ? { deviceId: user.deviceId, platform: 'telegram' } : undefined);
    return this.auth.openSession(user.id, device);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.closeSession(user.id);
  }

  /** Профиль и полный список прав — клиент строит по нему меню. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { ...user, permissions: ROLE_PERMISSIONS[user.role] };
  }
}
