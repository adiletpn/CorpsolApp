import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TerminalService } from './terminal.service';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, TerminalService],
  exports: [AttendanceService, TerminalService],
})
export class AttendanceModule {}
