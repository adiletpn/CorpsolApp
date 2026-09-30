import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  /**
   * Графики смен. По ним считается опоздание, поэтому список нужен и тем,
   * кто правит табель, а не только администратору.
   */
  @Get()
  @RequirePermissions('settings.manage', 'attendance.adjust')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.schedules.list(user);
  }

  @Post()
  @RequirePermissions('settings.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateScheduleDto) {
    return this.schedules.create(user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('settings.manage')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.schedules.remove(user, id);
  }
}

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
