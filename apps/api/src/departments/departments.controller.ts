import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  /** Список нужен и при заведении сотрудника, поэтому доступен шире настроек. */
  @Get()
  @RequirePermissions('settings.manage', 'employee.create', 'analytics.company', 'analytics.department')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.departments.list(user);
  }

  @Get(':id')
  @RequirePermissions('settings.manage', 'analytics.company', 'analytics.department')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.departments.findOne(user, id);
  }

  @Post()
  @RequirePermissions('settings.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepartmentDto) {
    return this.departments.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('settings.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departments.update(user, id, dto);
  }
}
