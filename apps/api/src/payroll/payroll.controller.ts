import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsBoolean } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PayrollService } from './payroll.service';
import { BonusRulesService } from './bonus-rules.service';
import { CalculatePayrollDto, CreateBonusRuleDto } from './dto';

class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly rules: BonusRulesService,
  ) {}

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
