import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { BonusRulesService } from './bonus-rules.service';
import { GradesService } from './grades.service';

@Module({
  imports: [PlansModule],
  controllers: [PayrollController],
  providers: [PayrollService, BonusRulesService, GradesService],
  exports: [PayrollService, GradesService],
})
export class PayrollModule {}
