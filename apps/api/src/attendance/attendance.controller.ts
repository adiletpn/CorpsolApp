import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
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
   * Экран терминала опрашивает этот эндпоинт каждые 30 секунд, предъявляя
   * собственный токен. Токен не открывает ничего, кроме QR-кода своего
   * терминала, поэтому монитор у входа безопасно оставить без присмотра.
   */
  @Public()
  @Get('terminal/:terminalId/code')
  async issueCode(
    @Param('terminalId') terminalId: string,
    @Query('token') token: string,
  ) {
    if (!token) throw new UnauthorizedException('Не передан токен терминала');

    const verifiedId = await this.terminals.resolveByAccessToken(terminalId, token);
    return this.terminals.issueCode(verifiedId);
  }

  /**
   * Выпуск токена для экрана. Открытое значение возвращается один раз —
   * его вставляют в адрес страницы терминала на мониторе.
   */
  @Post('terminal/:terminalId/access-token')
  @HttpCode(200)
  @RequirePermissions('settings.manage')
  issueAccessToken(@Param('terminalId') terminalId: string) {
    return this.terminals.issueAccessToken(terminalId);
  }
}
