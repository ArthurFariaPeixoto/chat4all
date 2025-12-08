import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class UpdateUserChannelDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
