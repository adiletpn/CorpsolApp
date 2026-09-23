import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ROLES, type Role } from '@corpsol/shared';

export class CreateEmployeeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;

  @IsIn(ROLES)
  role!: Role;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  officeId?: string;

  /** Оклад за расчётный период, в тиынах — целыми, без потерь на округлении. */
  @IsOptional()
  @IsInt()
  @Min(0)
  baseSalaryMinor?: number;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  officeId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  baseSalaryMinor?: number;
}

export class TerminateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
