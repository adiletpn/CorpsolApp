import { Module } from '@nestjs/common';

import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { AchievementsService } from './achievements.service';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [PlansModule],
  controllers: [GamificationController],
  providers: [GamificationService, AchievementsService],
  exports: [GamificationService, AchievementsService],
})
export class GamificationModule {}
