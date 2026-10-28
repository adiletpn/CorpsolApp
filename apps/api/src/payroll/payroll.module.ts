import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { BonusRulesService } from './bonus-rules.service';
import { GradesService } from './grades.service';
import { GradesScheduler } from './grades.scheduler';

@Module({
  imports: [PlansModule],
  controllers: [PayrollController],
  providers: [PayrollService, BonusRulesService, GradesService, GradesScheduler],
  exports: [PayrollService, GradesService],
})
export class PayrollModule {}
