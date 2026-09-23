import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { OfficesService } from './offices.service';
import { CreateOfficeDto, UpdateOfficeDto } from './dto';

@Controller('offices')
export class OfficesController {
  constructor(private readonly offices: OfficesService) {}

  /** Список нужен и при заведении сотрудника, поэтому доступен шире. */
  @Get()
  @RequirePermissions('office.manage', 'employee.create', 'analytics.company')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.offices.list(user);
  }

  @Get(':id')
  @RequirePermissions('office.manage', 'analytics.company')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offices.findOne(user, id);
  }

  @Post()
  @RequirePermissions('office.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOfficeDto) {
    return this.offices.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('office.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOfficeDto,
  ) {
    return this.offices.update(user, id, dto);
  }
}
