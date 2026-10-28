import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { IsBoolean } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PayrollService } from './payroll.service';
import { BonusRulesService } from './bonus-rules.service';
import { GradesService } from './grades.service';
import { AddAdjustmentDto, AssignGradeDto, CalculatePayrollDto, CreateBonusRuleDto, UpdateGradesDto } from './dto';

class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly rules: BonusRulesService,
    private readonly grades: GradesService,
  ) {}

  /**
   * Таблица рангов. Читают все, кто видит зарплату: менеджеру нужно
   * знать, сколько он получит за неделю в план и что даст следующий ранг.
   */
  @Get('grades')
  @RequirePermissions('payroll.read.self', 'payroll.read.department', 'payroll.read.all')
  listGrades(@CurrentUser() user: AuthenticatedUser) {
    return this.grades.tiers(user.organizationId);
  }

  /** Свой ранг и неделя — для мини-приложения. */
  @Get('grades/me')
  @RequirePermissions('payroll.read.self')
  myGrade(@CurrentUser() user: AuthenticatedUser) {
    return this.grades.progress(user.organizationId, user.id);
  }

  @Get('adjustments')
  @RequirePermissions('payroll.manage')
  listAdjustments(@CurrentUser() user: AuthenticatedUser, @Query('periodStart') periodStart: string) {
    return this.payroll.listAdjustments(user, periodStart);
  }

  @Post('adjustments')
  @HttpCode(200)
  @RequirePermissions('payroll.manage')
  addAdjustment(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddAdjustmentDto) {
    return this.payroll.addAdjustment(user, dto.userId, dto.periodStart, dto.amountMinor, dto.reason);
  }

  @Delete('adjustments/:id')
  @RequirePermissions('payroll.manage')
  removeAdjustment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payroll.removeAdjustment(user, id);
  }

  @Put('grades')
  @RequirePermissions('payroll.manage')
  updateGrades(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateGradesDto) {
    return this.grades.updateTiers(user, dto.tiers);
  }

  @Post('grades/assign')
  @HttpCode(200)
  @RequirePermissions('payroll.manage')
  assignGrade(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssignGradeDto) {
    return this.grades.assign(user, dto.userId, dto.code);
  }

  /** МОП видит только свой лист, РОП — отдел, директор — всю компанию. */
  @Get()
  @RequirePermissions('payroll.read.self', 'payroll.read.department', 'payroll.read.all')
  list(@CurrentUser() user: AuthenticatedUser, @Query('periodStart') periodStart?: string) {
    return this.payroll.list(user, periodStart);
  }

  @Post('calculate')
  @RequirePermissions('payroll.manage')
  calculate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CalculatePayrollDto) {
    return this.payroll.calculate(
      user,
      dto.userId ?? user.id,
      dto.periodStart,
      dto.periodEnd,
    );
  }

  /**
   * Утверждение расчёта. Отдельно от расчёта намеренно: посчитать можно
   * сколько угодно раз, а утверждение фиксирует суммы и сообщает о них
   * сотруднику.
   */
  @Post(':userId/approve')
  @HttpCode(200)
  @RequirePermissions('payroll.manage')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Query('periodStart') periodStart: string,
  ) {
    return this.payroll.approve(user, userId, periodStart);
  }

  @Get('rules')
  @RequirePermissions('payroll.manage', 'payroll.read.all')
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.rules.list(user);
  }

  @Post('rules')
  @RequirePermissions('payroll.manage')
  createRule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBonusRuleDto) {
    return this.rules.create(user, dto);
  }

  @Post('rules/:id/active')
  @RequirePermissions('payroll.manage')
  setRuleActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.rules.setActive(user, id, dto.isActive);
  }
}
