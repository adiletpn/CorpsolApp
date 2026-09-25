import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Сводка по всей компании — дашборд директора. */
  @Get('company')
  @RequirePermissions('analytics.company')
  company(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analytics.company(user, from, to);
  }

  /**
   * Сводка по отделу с разбивкой по сотрудникам — рабочий экран РОПа.
   * Чужой отдел он запросить не сможет: область подменяется своей.
   */
  @Get('department')
  @RequirePermissions('analytics.department')
  department(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.analytics.department(user, from, to, departmentId);
  }
}
