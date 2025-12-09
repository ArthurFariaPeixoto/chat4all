import { Controller, UseGuards, BadRequestException, NotFoundException, Post, Get, Body, Param, Req, HttpException, HttpStatus } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { ConversationService } from './conversation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// DTOs para REST API
interface CreateConversationDto {
  type: string;
  participantIds: string[];
  name?: string;
  metadata?: Record<string, string>;
}

@Controller()
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  // ============ REST API Endpoints ============
  
  @Post('conversations')
  @UseGuards(JwtAuthGuard)
  async createConversationRest(@Body() dto: CreateConversationDto, @Req() req: any) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const conversationType = dto.type.toUpperCase();
      const memberIds = [...new Set([userId, ...dto.participantIds])];

      const result = await this.conversationService.createConversation(
        conversationType,
        memberIds,
        userId,
        dto.name,
        dto.metadata,
      );

      // Garante que o campo 'id' esteja presente para facilitar o consumo pelo script
      return {
        id: result.conversation_id,
        ...result
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao criar conversa',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  async listConversationsRest(@Req() req: any) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.conversationService.listConversations(userId);
      return result;
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao listar conversas',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard)
  async getConversationRest(@Param('id') id: string, @Req() req: any) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.conversationService.getConversation(id, userId);
      return result;
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar conversa',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get('conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  async getConversationMessagesRest(@Param('id') conversationId: string, @Req() req: any) {
    try {
      const userId = req.user?.userId || req.user?.sub;
      
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      // Verificar se o usuário tem acesso à conversa
      await this.conversationService.getConversation(conversationId, userId);
      
      // Retornar mensagens (implementar depois)
      return [];
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar mensagens',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  // ============ gRPC Endpoints ============

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('ConversationService', 'CreateConversation')
  async createConversation(data: {
    type: string | number;
    member_ids: string[];
    name?: string;
    metadata?: Record<string, string>;
  }, context?: any) {
    try {
      // Extrair userId do contexto gRPC (setado pelo JwtAuthGuard)
      const userId = context?.user?.userId;
      
      if (!userId) {
        throw new RpcException({
          status: 16, // UNAUTHENTICATED
          message: 'User ID not found in token',
        });
      }

      // Validar que o tipo foi fornecido
      if (data.type === undefined || data.type === null) {
        throw new RpcException({
          status: 3, // INVALID_ARGUMENT
          message: 'Conversation type is required',
        });
      }

      // Converter tipo do enum para string simples
      let conversationType: string;
      if (typeof data.type === 'number') {
        // Se for número (enum), converter: 1 = PRIVATE, 2 = GROUP
        conversationType = data.type === 1 ? 'PRIVATE' : data.type === 2 ? 'GROUP' : 'UNSPECIFIED';
      } else if (typeof data.type === 'string') {
        // Se for string, remover prefixo CONVERSATION_TYPE_ se existir
        conversationType = data.type.replace('CONVERSATION_TYPE_', '').toUpperCase();
      } else {
        throw new RpcException({
          status: 3, // INVALID_ARGUMENT
          message: 'Invalid conversation type format',
        });
      }

      // Garantir que o userId do token está na lista de membros
      const memberIds = [...new Set([userId, ...data.member_ids])];

      const result = await this.conversationService.createConversation(
        conversationType,
        memberIds,
        userId,
        data.name,
        data.metadata,
      );
      
      return result;
    } catch (error) {
      console.error('Error in CreateConversation controller:', error);
      console.error('Error type:', error?.constructor?.name);
      
      // Se já é um RpcException, propagar diretamente
      if (error instanceof RpcException) {
        throw error;
      }
      
      // Converter exceções do NestJS para RpcException
      if (error instanceof BadRequestException) {
        throw new RpcException({
          status: 3, // INVALID_ARGUMENT
          message: error.message || 'Invalid request',
        });
      }
      
      if (error instanceof NotFoundException) {
        throw new RpcException({
          status: 5, // NOT_FOUND
          message: error.message || 'Resource not found',
        });
      }
      
      // Para outros erros, converter para RpcException INTERNAL
      throw new RpcException({
        status: 13, // INTERNAL
        message: error.message || 'Internal server error',
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('ConversationService', 'GetConversation')
  async getConversation(data: { conversation_id: string }, context?: any) {
    try {
      const userId = context?.user?.userId;
      if (!userId) {
        throw new RpcException({
          status: 16, // UNAUTHENTICATED
          message: 'User ID not found in token',
        });
      }
      return await this.conversationService.getConversation(data.conversation_id, userId);
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw new RpcException({
          status: 3, // INVALID_ARGUMENT
          message: error.message || 'Invalid request',
        });
      }
      if (error instanceof NotFoundException) {
        throw new RpcException({
          status: 5, // NOT_FOUND
          message: error.message || 'Resource not found',
        });
      }
      throw new RpcException({
        status: 13, // INTERNAL
        message: error.message || 'Internal server error',
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('ConversationService', 'ListConversations')
  async listConversations(data: {
    include_archived?: boolean;
    page_size?: number;
    page_token?: string;
  }, context?: any) {
    try {
      const userId = context?.user?.userId;
      if (!userId) {
        throw new RpcException({
          status: 16, // UNAUTHENTICATED
          message: 'User ID not found in token',
        });
      }
      return await this.conversationService.listConversations(
        userId,
        data.include_archived || false,
        data.page_size || 50,
        data.page_token,
      );
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw new RpcException({
          status: 3, // INVALID_ARGUMENT
          message: error.message || 'Invalid request',
        });
      }
      if (error instanceof NotFoundException) {
        throw new RpcException({
          status: 5, // NOT_FOUND
          message: error.message || 'Resource not found',
        });
      }
      throw new RpcException({
        status: 13, // INTERNAL
        message: error.message || 'Internal server error',
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('ConversationService', 'AddMembers')
  async addMembers(
    data: {
      conversation_id: string;
      user_ids: string[];
      role?: string;
    },
    context?: any,
  ) {
    try {
      const addedBy = context?.user?.userId;
      return await this.conversationService.addMembers(
        data.conversation_id,
        data.user_ids,
        data.role || 'MEMBER',
        addedBy,
      );
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw new RpcException({
          status: 3, // INVALID_ARGUMENT
          message: error.message || 'Invalid request',
        });
      }
      if (error instanceof NotFoundException) {
        throw new RpcException({
          status: 5, // NOT_FOUND
          message: error.message || 'Resource not found',
        });
      }
      throw new RpcException({
        status: 13, // INTERNAL
        message: error.message || 'Internal server error',
      });
    }
  }
}

