import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TerminalsService } from './terminals.service';

class CreateTerminalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  officeId!: string;
}

class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@Controller('terminals')
export class TerminalsController {
  constructor(private readonly terminals: TerminalsService) {}

  @Get()
  @RequirePermissions('settings.manage')
  list(@CurrentUser() user: AuthenticatedUser, @Query('officeId') officeId?: string) {
    return this.terminals.list(user, officeId);
  }

  /**
   * Создание терминала. Секрет подписи QR генерируется сервером
   * и наружу не отдаётся — иначе код можно было бы сгенерировать вне офиса.
   */
  @Post()
  @RequirePermissions('settings.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTerminalDto) {
    return this.terminals.create(user, dto.officeId, dto.name);
  }

  @Post(':id/active')
  @HttpCode(200)
  @RequirePermissions('settings.manage')
  setActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.terminals.setActive(user, id, dto.isActive);
  }

  /** QR на листок для двери. Повторная печать отменяет прежний листок. */
  @Post(':id/printed-code')
  @HttpCode(200)
  @RequirePermissions('settings.manage')
  printCode(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.terminals.printCode(user, id);
  }

  @Delete(':id/printed-code')
  @RequirePermissions('settings.manage')
  revokePrinted(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.terminals.revokePrinted(user, id);
  }
}
