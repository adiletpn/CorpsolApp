import { Global, Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Модуль глобальный: уведомления рождаются в разных местах — в заявках
 * на устройство, в расчёте зарплаты, в планах. Тянуть импорт в каждый
 * модуль означало бы плодить связи ради одного вызова.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
