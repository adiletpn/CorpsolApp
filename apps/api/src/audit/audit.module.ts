import { Controller, Get, Module, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * Журнал действий. `sensitiveOnly=true` оставляет только ручные обходы
   * контроля: правку табеля, открепление телефона, увольнение.
   */
  @Get()
  @RequirePermissions('audit.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('sensitiveOnly') sensitiveOnly?: string,
  ) {
    return this.audit.list(user, {
      limit: limit ? Number(limit) : undefined,
      action,
      sensitiveOnly: sensitiveOnly === 'true',
    });
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
