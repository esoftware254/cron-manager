import { IsString, IsOptional, IsBoolean, IsInt, IsEnum, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCronJobDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  cronExpression: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsString()
  endpointUrl: string;

  @IsOptional()
  @IsEnum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
  httpMethod?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsObject()
  queryParams?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  retryCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(300000)
  timeoutMs?: number;
}

