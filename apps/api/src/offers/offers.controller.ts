import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { OffersService } from './offers.service';
import { CreateOfferDto, ResolveOfferDto } from './dto';

@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  @RequirePermissions('offer.read.self', 'offer.read.department', 'offer.read.all')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.offers.list(user, from, to);
  }

  @Post()
  @RequirePermissions('offer.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOfferDto) {
    return this.offers.create(user, dto);
  }

  /**
   * Решение по сделке. Право проверяется внутри: отметить принятой
   * может только руководитель, отказ автор ставит себе сам.
   */
  @Post(':id/resolve')
  @RequirePermissions('offer.create', 'offer.confirm')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveOfferDto,
  ) {
    return this.offers.resolve(user, id, dto.status, dto.note);
  }
}
