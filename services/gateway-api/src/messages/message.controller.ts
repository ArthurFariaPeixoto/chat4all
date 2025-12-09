import { Controller, UseGuards, Logger, Post, Get, Patch, Body, Param, Req, HttpException, HttpStatus } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MessageService } from './message.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// DTOs para REST API
interface SendMessageDto {
  conversationId: string;
  content: string;
  type?: string;
  channels?: string[];
  metadata?: Record<string, string>;
}

interface UpdateMessageStatusDto {
  status: string;
}

@Controller()
export class MessageController {
  private readonly logger = new Logger(MessageController.name);

  constructor(private messageService: MessageService) {}

  // ============ REST API Endpoints ============
  
  @Post('messages')
  @UseGuards(JwtAuthGuard)
  async sendMessageRest(@Body() dto: SendMessageDto, @Req() req: any) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        type: dto.type || 'text',
        text: dto.content,
      };

      const result = await this.messageService.sendMessage(
        messageId,
        dto.conversationId,
        userId,
        dto.channels || ['local'],
        payload,
        dto.metadata,
      );

      // Garante que o campo 'id' esteja presente para facilitar o consumo pelo script
      return {
        id: result.message_id,
        ...result
      };
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`);
      throw new HttpException(
        error.message || 'Erro ao enviar mensagem',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('messages/:id')
  @UseGuards(JwtAuthGuard)
  async getMessageRest(@Param('id') messageId: string, @Req() req: any) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      // Buscar mensagem diretamente do MongoDB
      const mongoDBService = this.messageService['mongoDBService'];
      const messagesCollection = mongoDBService.getMessagesCollection();
      const message = await messagesCollection.findOne({ message_id: messageId });
      
      if (!message) {
        throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
      }
      
      return {
        id: message.message_id,
        conversationId: message.conversation_id,
        senderId: message.from,
        status: message.status || 'SENT',
        content: message.payload?.text,
        type: message.payload?.type,
        sentAt: message.created_at,
        readAt: message.read_at,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar mensagem',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  @Patch('messages/:id/status')
  @UseGuards(JwtAuthGuard)
  async updateMessageStatusRest(
    @Param('id') messageId: string,
    @Body() dto: UpdateMessageStatusDto,
    @Req() req: any
  ) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      // Buscar a mensagem para obter o conversationId
      const mongoDBService = this.messageService['mongoDBService'];
      const messagesCollection = mongoDBService.getMessagesCollection();
      const message = await messagesCollection.findOne({ message_id: messageId });
      
      if (!message) {
        throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
      }

      // Marcar como lido se o status for READ ou DELIVERED
      if (dto.status.toUpperCase() === 'READ') {
        await this.messageService.markAsRead(messageId, message.conversation_id, userId);
      } else if (dto.status.toUpperCase() === 'DELIVERED') {
        // Atualizar status para DELIVERED
        await messagesCollection.updateOne(
          { message_id: messageId },
          { $set: { status: 'DELIVERED', delivered_at: new Date() } }
        );
      }
      
      return { success: true, status: dto.status };
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao atualizar status',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('messages/:id/history')
  @UseGuards(JwtAuthGuard)
  async getMessageHistoryRest(@Param('id') messageId: string, @Req() req: any) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      // Buscar mensagem do MongoDB
      const mongoDBService = this.messageService['mongoDBService'];
      const messagesCollection = mongoDBService.getMessagesCollection();
      const message = await messagesCollection.findOne({ message_id: messageId });
      
      if (!message) {
        throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
      }
      
      const history = [];
      if (message.created_at) {
        history.push({ status: 'SENT', timestamp: message.created_at });
      }
      if (message.delivered_at) {
        history.push({ status: 'DELIVERED', timestamp: message.delivered_at });
      }
      if (message.read_at) {
        history.push({ status: 'READ', timestamp: message.read_at });
      }
      
      return {
        messageId: message.message_id,
        history: history,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar histórico',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  // ============ gRPC Endpoints ============

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

