import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto';

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /**
   * Планы с учётом роли. МОП по ТЗ видит свой план и общий план отдела,
   * но не результаты коллег поимённо — отбор идёт в сервисе.
   */
  @Get()
  @RequirePermissions('plan.read.self', 'plan.read.department', 'plan.read.all')
  list(@CurrentUser() user: AuthenticatedUser, @Query('periodStart') periodStart?: string) {
    return this.plans.listVisible(user, periodStart);
  }

  @Post()
  @RequirePermissions('plan.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePlanDto) {
    return this.plans.create(user, dto);
  }
}
