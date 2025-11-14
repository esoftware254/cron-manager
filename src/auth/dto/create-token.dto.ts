import { IsString, IsArray, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { Permission } from '@prisma/client';

export class CreateTokenDto {
  @IsString()
  name: string;

  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions: Permission[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

