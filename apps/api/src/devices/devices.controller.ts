import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { DevicesService } from './devices.service';

class ResolveRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Очередь заявок на перепривязку — рабочий экран HR. */
  @Get('requests')
  @RequirePermissions('device.unbind')
  listRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.devices.listPendingRequests(user.organizationId);
  }

  @Post('requests/:id/approve')
  @RequirePermissions('device.unbind')
  approve(
    @Param('id') id: string,
    @Body() dto: ResolveRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devices.approveRequest(id, user.id, dto.note);
  }

  @Post('requests/:id/reject')
  @RequirePermissions('device.unbind')
  reject(
    @Param('id') id: string,
    @Body() dto: ResolveRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devices.rejectRequest(id, user.id, dto.note);
  }

  @Post('users/:userId/unbind')
  @RequirePermissions('device.unbind')
  unbind(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devices.unbind(userId, user.id);
  }
}
