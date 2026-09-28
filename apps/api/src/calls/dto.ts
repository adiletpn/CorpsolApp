import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class ImportCallsDto {
  /**
   * Содержимое файла выгрузки целиком. Передаётся текстом, а не файлом:
   * детализация Kcell — это CSV на несколько сотен килобайт, и возиться
   * с загрузкой файлов ради этого незачем.
   */
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsIn(['KCELL', 'BITRIX', 'MANUAL'])
  source?: 'KCELL' | 'BITRIX' | 'MANUAL';
}

/** Привязка рабочего номера к сотруднику. */
export class LinkWorkNumberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  workNumber!: string;

  @IsIn(['KCELL', 'BITRIX'])
  provider!: 'KCELL' | 'BITRIX';
}

export class ListCallsQueryDto {
  @IsOptional()
  @Matches(DATE_KEY)
  from?: string;

  @IsOptional()
  @Matches(DATE_KEY)
  to?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class ConnectBitrixDto {
  /**
   * Вебхук портала: https://портал.bitrix24.kz/rest/1/токен
   * Хранится на сервере и наружу больше не отдаётся.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  webhookUrl!: string;
}

export class SyncBitrixDto {
  /** Необязательная нижняя граница. Без неё продолжаем с прошлой точки. */
  @IsOptional()
  @IsISO8601()
  since?: string;
}
