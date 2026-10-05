import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { GamificationService } from './gamification.service';
import { AchievementsService } from './achievements.service';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

class EvaluateAchievementsDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @Matches(DATE_KEY)
  periodStart!: string;

  @Matches(DATE_KEY)
  periodEnd!: string;
}

@Controller('gamification')
export class GamificationController {
  constructor(
    private readonly gamification: GamificationService,
    private readonly achievements: AchievementsService,
  ) {}

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

  /**
   * Пересчёт ачивок сотрудника за период. Повторный вызов безопасен:
   * уже выданное повторно не начисляется.
   */
  @Post('achievements/evaluate')
  @HttpCode(200)
  @RequirePermissions('payroll.manage')
  evaluate(@CurrentUser() user: AuthenticatedUser, @Body() dto: EvaluateAchievementsDto) {
    return this.achievements.evaluate(
      user.organizationId,
      dto.userId,
      dto.periodStart,
      dto.periodEnd,
    );
  }

  /** Свои ачивки — экран сотрудника. Чужие здесь не отдаются. */
  @Get('achievements')
  @RequirePermissions('leaderboard.read')
  myAchievements(@CurrentUser() user: AuthenticatedUser) {
    return this.achievements.listForUser(user.id);
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
