import { Controller, UseGuards, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MessageService } from './message.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class MessageController {
  private readonly logger = new Logger(MessageController.name);

  constructor(private messageService: MessageService) {}

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('MessageService', 'SendMessage')
  async sendMessage(
    data: {
      message_id: string;
      conversation_id: string;
      channels: string[];
      payload: {
        type: string;
        text?: string;
        file?: {
          file_id: string;
          name: string;
          mime_type: string;
          size: number;
          thumbnail_url?: string;
        };
        location?: {
          latitude: number;
          longitude: number;
          address?: string;
        };
        contact?: {
          name: string;
          phone?: string;
          email?: string;
        };
      };
      metadata?: Record<string, string>;
    },
    context?: any,
  ) {
    // Extrair userId do token
    const userId = context?.user?.userId;
    if (!userId) {
      this.logger.error(`[SendMessage] UserId não encontrado no token`);
      throw new Error('User ID not found in token');
    }

    this.logger.log(`[SendMessage] Recebida requisição - message_id: ${data.message_id}, conversation_id: ${data.conversation_id}, userId: ${userId}`);
    this.logger.debug(`[SendMessage] Dados completos: ${JSON.stringify(data)}`);

    try {
      const result = await this.messageService.sendMessage(
        data.message_id,
        data.conversation_id,
        userId,
        data.channels,
        data.payload,
        data.metadata,
      );
      
      this.logger.log(`[SendMessage] Mensagem processada com sucesso - message_id: ${data.message_id}, status: ${result.status}`);
      return result;
    } catch (error) {
      this.logger.error(`[SendMessage] Erro ao processar mensagem - message_id: ${data.message_id}`, error.stack || error.message);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('MessageService', 'MarkAsRead')
  async markAsRead(
    data: {
      message_id: string;
      conversation_id: string;
    },
    context?: any,
  ): Promise<{ success: boolean; timestamp: number }> {
    const userId = context?.user?.userId;
    if (!userId) {
      this.logger.error(`[MarkAsRead] UserId não encontrado no token`);
      throw new Error('User ID not found in token');
    }

    this.logger.log(
      `[MarkAsRead] message_id: ${data.message_id}, user_id: ${userId}`
    );

    try {
      await this.messageService.markAsRead(
        data.message_id,
        data.conversation_id,
        userId
      );

      return {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      this.logger.error(`[MarkAsRead] Erro:`, error.message);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('MessageService', 'GetMessageStatus')
  async getMessageStatus(
    data: { message_id: string; conversation_id: string },
    context?: any,
  ): Promise<{
    message_id: string;
    status: string;
    timeline: Array<{
      event: string;
      timestamp: number;
      user_id?: string;
    }>;
  }> {
    const userId = context?.user?.userId;
    if (!userId) {
      this.logger.error(`[GetMessageStatus] UserId não encontrado no token`);
      throw new Error('User ID not found in token');
    }

    this.logger.log(
      `[GetMessageStatus] message_id: ${data.message_id}, user_id: ${userId}`
    );

    try {
      const result = await this.messageService.getMessageStatus(
        data.message_id,
        data.conversation_id,
        userId
      );

      this.logger.log(
        `[GetMessageStatus] Status retornado - status: ${result.status}, events: ${result.timeline.length}`
      );
      return result;
    } catch (error) {
      this.logger.error(`[GetMessageStatus] Erro:`, error.message);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('MessageService', 'GetMessages')
  async getMessages(
    data: {
      conversation_id: string;
      since_seq?: number;
      until_seq?: number;
      limit?: number;
      reverse?: boolean;
    },
    context?: any,
  ) {
    this.logger.log(`[GetMessages] Requisição recebida - conversation_id: ${data.conversation_id}, since_seq: ${data.since_seq}, until_seq: ${data.until_seq}, limit: ${data.limit}, reverse: ${data.reverse}`);
    this.logger.debug(`[GetMessages] Dados completos: ${JSON.stringify(data)}`);
    
    // Extrair userId do token
    const userId = context?.user?.userId;
    if (!userId) {
      this.logger.error(`[GetMessages] UserId não encontrado no token`);
      throw new Error('User ID not found in token');
    }

    this.logger.log(`[GetMessages] UserId extraído do token: ${userId}`);

    try {
      const result = await this.messageService.getMessages(
        data.conversation_id,
        userId,
        data.since_seq,
        data.until_seq,
        data.limit || 50,
        data.reverse || false,
      );
      
      this.logger.log(`[GetMessages] Resposta preparada - messages: ${result.messages?.length || 0}, has_more: ${result.has_more}, next_seq: ${result.next_seq}`);
      return result;
    } catch (error) {
      this.logger.error(`[GetMessages] Erro ao processar requisição - conversation_id: ${data.conversation_id}`, error.stack || error.message);
      throw error;
    }
  }
}

