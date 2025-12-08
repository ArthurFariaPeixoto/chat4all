import { IsString, IsNotEmpty, IsObject, IsOptional, IsNumber } from 'class-validator';

/**
 * DTO para callback de entrega de mensagem
 */
export class DeliveryCallbackDto {
  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @IsNotEmpty()
  conversation_id: string;

  @IsString()
  @IsNotEmpty()
  recipient_id: string;

  @IsString()
  @IsNotEmpty()
  status: string; // 'DELIVERED'

  @IsNumber()
  @IsNotEmpty()
  timestamp: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para callback de leitura de mensagem
 */
export class ReadCallbackDto {
  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @IsNotEmpty()
  conversation_id: string;

  @IsString()
  @IsNotEmpty()
  reader_id: string;

  @IsString()
  @IsNotEmpty()
  status: string; // 'READ'

  @IsNumber()
  @IsNotEmpty()
  timestamp: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
