import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TerminalService } from './terminal.service';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';
import { AttendanceAdjustmentService } from './adjustment.service';
import { AbsenceService } from './absence.service';

@Module({
  controllers: [AttendanceController, TerminalsController],
  providers: [
    AttendanceService,
    TerminalService,
    TerminalsService,
    AttendanceAdjustmentService,
    AbsenceService,
  ],
  exports: [AttendanceService, TerminalService, TerminalsService, AbsenceService],
})
export class AttendanceModule {}
