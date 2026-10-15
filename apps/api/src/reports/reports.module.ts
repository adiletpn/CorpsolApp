import { Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance/attendance.module';
import { PayrollModule } from '../payroll/payroll.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AttendanceModule, PayrollModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
