import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TerminalService } from './terminal.service';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';
import { AttendanceAdjustmentService } from './adjustment.service';
import { AbsenceService } from './absence.service';
import { CallRateService } from './call-rate.service';
import { FenceAttemptsService } from './fence-attempts.service';

@Module({
  controllers: [AttendanceController, TerminalsController],
  providers: [
    AttendanceService,
    TerminalService,
    TerminalsService,
    AttendanceAdjustmentService,
    AbsenceService,
    CallRateService,
    FenceAttemptsService,
  ],
  exports: [AttendanceService, TerminalService, TerminalsService, AbsenceService],
})
export class AttendanceModule {}
