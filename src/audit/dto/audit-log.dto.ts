import { IsString, IsOptional, IsObject, IsNumber } from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  tokenId?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsObject()
  requestPayload?: any;

  @IsOptional()
  @IsNumber()
  responseStatus?: number;
}

