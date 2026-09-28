import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CallsService } from './calls.service';
import { CallsImportService } from './calls-import.service';
import { WorkNumbersService } from './work-numbers.service';
import { parseKcellExport } from './kcell-parser';
import { IntegrationsService } from './integrations.service';
import { BitrixSyncService } from './bitrix-sync.service';
import { ConnectBitrixDto, ImportCallsDto, LinkWorkNumberDto, SyncBitrixDto } from './dto';

@Controller('calls')
export class CallsController {
  constructor(
    private readonly calls: CallsService,
    private readonly importer: CallsImportService,
    private readonly workNumbers: WorkNumbersService,
    private readonly integrations: IntegrationsService,
    private readonly bitrixSync: BitrixSyncService,
  ) {}

  @Get()
  @RequirePermissions('calls.read.self', 'calls.read.department', 'calls.read.all')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.calls.list(user, from, to, userId);
  }

  @Get('summary')
  @RequirePermissions('calls.read.self', 'calls.read.department', 'calls.read.all')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.calls.summary(user, from, to, userId);
  }

  /**
   * Загрузка детализации оператора.
   *
   * Отчёт возвращает не только число загруженных, но и номера, которые
   * не легли ни на кого: без этого массовое несопоставление выглядело бы
   * как успешный импорт с пустой статистикой.
   */
  @Post('import')
  @HttpCode(200)
  @RequirePermissions('integration.manage')
  async import(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportCallsDto) {
    const parsed = parseKcellExport(dto.content);

    const summary = await this.importer.importCalls(
      user.organizationId,
      parsed.calls,
      dto.source ?? 'KCELL',
    );

    return { ...summary, rejectedRows: parsed.rejected };
  }

  /** Состояние интеграций. Адрес вебхука отдаётся только замаскированным. */
  @Get('integrations')
  @RequirePermissions('integration.manage')
  listIntegrations(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.list(user);
  }

  @Post('integrations/bitrix')
  @HttpCode(200)
  @RequirePermissions('integration.manage')
  connectBitrix(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectBitrixDto) {
    return this.integrations.connectBitrix(user, dto.webhookUrl);
  }

  @Delete('integrations/bitrix')
  @HttpCode(204)
  @RequirePermissions('integration.manage')
  disconnectBitrix(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.disconnect(user, 'BITRIX');
  }

  @Post('integrations/bitrix/sync')
  @HttpCode(200)
  @RequirePermissions('integration.manage')
  syncBitrix(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncBitrixDto) {
    return this.bitrixSync.sync(
      user.organizationId,
      dto.since ? new Date(dto.since) : undefined,
    );
  }

  @Get('work-numbers')
  @RequirePermissions('integration.manage')
  listWorkNumbers(@CurrentUser() user: AuthenticatedUser) {
    return this.workNumbers.list(user);
  }

  @Post('work-numbers')
  @RequirePermissions('integration.manage')
  linkWorkNumber(@CurrentUser() user: AuthenticatedUser, @Body() dto: LinkWorkNumberDto) {
    return this.workNumbers.link(user, dto.userId, dto.workNumber, dto.provider);
  }

  @Delete('work-numbers')
  @HttpCode(204)
  @RequirePermissions('integration.manage')
  unlinkWorkNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Query('provider') provider: 'KCELL' | 'BITRIX',
    @Query('workNumber') workNumber: string,
  ) {
    return this.workNumbers.unlink(user, provider, workNumber);
  }
}
