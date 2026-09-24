import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  clientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientPhone?: string;

  /** Сумма оффера в тиынах — целыми, без потерь на округлении. */
  @IsInt()
  @Min(0)
  amountMinor!: number;
}

/** Решение по сделке. «Принят» выносит руководитель, остальное — автор. */
export class ResolveOfferDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'EXPIRED'])
  status!: 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListOffersQueryDto {
  @IsOptional()
  @Matches(DATE_KEY)
  from?: string;

  @IsOptional()
  @Matches(DATE_KEY)
  to?: string;
}
