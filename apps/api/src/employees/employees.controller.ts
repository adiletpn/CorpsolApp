import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ASSIGNABLE_ROLES } from '@corpsol/shared';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, TerminateEmployeeDto, UpdateEmployeeDto } from './dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employee.read.all', 'employee.read.department')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeTerminated') includeTerminated?: string,
  ) {
    return this.employees.list(user, includeTerminated === 'true');
  }

  /** Роли, которые вправе выдать текущий пользователь — по нему строится форма. */
  @Get('assignable-roles')
  @RequirePermissions('employee.create')
  assignableRoles(@CurrentUser() user: AuthenticatedUser) {
    return { roles: ASSIGNABLE_ROLES[user.role] };
  }

  @Get(':id')
  @RequirePermissions('employee.read.all', 'employee.read.department')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employees.findOne(user, id);
  }

  /**
   * Временный пароль возвращается один раз — его передают сотруднику,
   * и он меняет его при первом входе.
   */
  @Post()
  @RequirePermissions('employee.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('employee.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, dto);
  }

  @Post(':id/terminate')
  @HttpCode(204)
  @RequirePermissions('employee.terminate')
  terminate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TerminateEmployeeDto,
  ) {
    return this.employees.terminate(user, id, dto.reason);
  }
}
