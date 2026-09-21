import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AttendanceService } from './attendance.service';
import { TerminalService } from './terminal.service';
import { CheckInDto, CheckOutDto } from './dto';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly terminals: TerminalService,
  ) {}

  @Post('check-in')
  @HttpCode(200)
  @RequirePermissions('attendance.checkin')
  checkIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(user, dto);
  }

  @Post('check-out')
  @HttpCode(200)
  @RequirePermissions('attendance.checkin')
  checkOut(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckOutDto) {
    return this.attendance.checkOut(user, dto.capturedAt);
  }

  @Get('me')
  @RequirePermissions('attendance.read.self')
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.attendance.listForUser(user.id, new Date(from), new Date(to));
  }

  @Get()
  @RequirePermissions('attendance.read.department', 'attendance.read.all')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.attendance.listScoped(user, new Date(from), new Date(to), departmentId);
  }

  /**
   * Экран терминала опрашивает этот эндпоинт каждые 30 секунд.
   * Страницу терминала открывает админ под своей учёткой и оставляет
   * на мониторе — секрет терминала при этом на клиент не уходит.
   */
  @Get('terminal/:terminalId/code')
  @RequirePermissions('settings.manage')
  issueCode(@Param('terminalId') terminalId: string) {
    return this.terminals.issueCode(terminalId);
  }
}
