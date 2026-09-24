import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { GamificationService } from './gamification.service';

@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  /**
   * Рейтинг за период. В нём только очки и имена: оклады, премии и планы
   * остаются личными данными и наружу не выходят.
   */
  @Get('leaderboard')
  @RequirePermissions('leaderboard.read')
  leaderboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.gamification.leaderboard(user, from, to, departmentId);
  }

  @Get('my-points')
  @RequirePermissions('leaderboard.read')
  myPoints(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.gamification.myPoints(user, from, to);
  }
}
