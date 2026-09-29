import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TerminalService } from './terminal.service';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';
import { AttendanceAdjustmentService } from './adjustment.service';

@Module({
  controllers: [AttendanceController, TerminalsController],
  providers: [
    AttendanceService,
    TerminalService,
    TerminalsService,
    AttendanceAdjustmentService,
  ],
  exports: [AttendanceService, TerminalService, TerminalsService],
})
export class AttendanceModule {}
