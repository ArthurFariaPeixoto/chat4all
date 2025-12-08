import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateUserChannelDto {
  @IsString()
  @IsNotEmpty()
  channelName: string; // whatsapp, instagram, telegram, messenger, sms

  @IsString()
  @IsNotEmpty()
  channelUserId: string; // ID do usuário no canal (phone, username, etc)

  @IsString()
  @IsOptional()
  displayName?: string; // Nome a exibir

  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>; // Credenciais (token, API key, etc)

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
