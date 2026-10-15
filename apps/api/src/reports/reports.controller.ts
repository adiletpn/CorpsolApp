import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ReportsService } from './reports.service';

/**
 * Выгрузки документов.
 *
 * Отдаются файлом, а не JSON: эти данные идут не в экран, а в папку
 * бухгалтера. Имя файла собирается с периодом внутри — в папке за год
 * лежит дюжина таких, и «report.csv» среди них бесполезен.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('attendance.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequirePermissions('attendance.read.department', 'attendance.read.all')
  async attendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res({ passthrough: true }) response: Response,
    @Query('departmentId') departmentId?: string,
  ): Promise<string> {
    const csv = await this.reports.attendanceCsv(user, from, to, departmentId);
    this.asDownload(response, `tabel_${from}_${to}.csv`);
    return csv;
  }

  @Get('payroll.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequirePermissions('payroll.read.department', 'payroll.read.all')
  async payroll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodStart') periodStart: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const csv = await this.reports.payrollCsv(user, periodStart);
    this.asDownload(response, `zarplata_${periodStart}.csv`);
    return csv;
  }

  /**
   * Заставляет браузер скачать файл, а не показать его текстом.
   *
   * Имя латиницей намеренно: кириллица в заголовке требует отдельного
   * кодирования, и часть программ сохраняет её мусором.
   */
  private asDownload(response: Response, filename: string): void {
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}
