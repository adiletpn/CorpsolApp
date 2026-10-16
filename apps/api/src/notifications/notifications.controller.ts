import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

/**
 * Свои уведомления.
 *
 * Отдельного права нет намеренно: список личный, и видеть его может
 * каждый вошедший — но только свой.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.notifications.list(user.id, limit ? Number(limit) : undefined);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @HttpCode(200)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return { marked: await this.notifications.markAllRead(user.id) };
  }
}
