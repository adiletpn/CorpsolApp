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
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AttendanceService } from './attendance.service';
import { AttendanceAdjustmentService } from './adjustment.service';
import { AbsenceService } from './absence.service';
import { CallRateService } from './call-rate.service';
import { TerminalService } from './terminal.service';
import {
  AdjustAttendanceDto,
  CheckCallRateDto,
  CheckInDto,
  CheckOutDto,
  MarkAbsencesDto,
} from './dto';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly terminals: TerminalService,
    private readonly adjustments: AttendanceAdjustmentService,
    private readonly absences: AbsenceService,
    private readonly callRate: CallRateService,
  ) {}

  /**
   * Догнать прогулы за день вручную.
   *
   * Ночная задача может не отработать — сервер перезапускали, база была
   * недоступна. Без ручного запуска такой день пришлось бы закрывать
   * правкой по каждому сотруднику отдельно.
   */
  @Post('mark-absences')
  @HttpCode(200)
  @RequirePermissions('attendance.adjust')
  markAbsences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkAbsencesDto,
  ) {
    return this.absences.markForOrganization(user.organizationId, dto.workDate);
  }

  /**
   * Перепроверить дозвоны за день.
   *
   * Нужен после ручной загрузки выгрузки Kcell: ночная проверка видела
   * день без звонков, и с полными данными он может вернуться в зачёт.
   */
  @Post('check-call-rate')
  @HttpCode(200)
  @RequirePermissions('attendance.adjust')
  checkCallRate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckCallRateDto,
  ) {
    return this.callRate.checkForOrganization(user.organizationId, dto.workDate);
  }

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
    return this.attendance.listForUser(user.id, from, to);
  }

  @Get()
  @RequirePermissions('attendance.read.department', 'attendance.read.all')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.attendance.listScoped(user, from, to, departmentId);
  }

  /**
   * Ручная правка табеля руководителем: сотрудник забыл отсканировать,
   * был на выезде к клиенту. Причина обязательна, запись помечается
   * как ручная и попадает в журнал аудита.
   */
  @Post('adjust/:userId')
  @HttpCode(200)
  @RequirePermissions('attendance.adjust')
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AdjustAttendanceDto,
  ) {
    return this.adjustments.adjust(user, userId, dto);
  }

  /**
   * Экран терминала опрашивает этот эндпоинт каждые 30 секунд, предъявляя
   * собственный токен. Токен не открывает ничего, кроме QR-кода своего
   * терминала, поэтому монитор у входа безопасно оставить без присмотра.
   */
  @Public()
  // Экран спрашивает код раз в тридцать секунд; две дюжины в минуту
  // с запасом покрывают перезагрузку страницы и сбои сети, но перебор
  // токена останавливают на корню.
  @RateLimit({ limit: 24, windowMs: 60_000 })
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
