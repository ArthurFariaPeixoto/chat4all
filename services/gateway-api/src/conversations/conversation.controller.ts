import { Controller, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ConversationService } from './conversation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('ConversationService', 'CreateConversation')
  async createConversation(data: {
    type: string | number;
    member_ids: string[];
    name?: string;
    metadata?: Record<string, string>;
  }, context?: any) {
    // Extrair userId do contexto gRPC (setado pelo JwtAuthGuard)
    const userId = context?.user?.userId;
    
    if (!userId) {
      throw new Error('User ID not found in token');
    }

    // Converter tipo do enum para string simples
    let conversationType: string;
    if (typeof data.type === 'number') {
      // Se for número (enum), converter: 1 = PRIVATE, 2 = GROUP
      conversationType = data.type === 1 ? 'PRIVATE' : data.type === 2 ? 'GROUP' : 'UNSPECIFIED';
    } else {
      // Se for string, remover prefixo CONVERSATION_TYPE_ se existir
      conversationType = data.type.replace('CONVERSATION_TYPE_', '').toUpperCase();
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
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('ConversationService', 'GetConversation')
  async getConversation(data: { conversation_id: string }, context?: any) {
    const userId = context?.user?.userId;
    if (!userId) {
      throw new Error('User ID not found in token');
    }
    return this.conversationService.getConversation(data.conversation_id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @GrpcMethod('ConversationService', 'ListConversations')
  async listConversations(data: {
    include_archived?: boolean;
    page_size?: number;
    page_token?: string;
  }, context?: any) {
    const userId = context?.user?.userId;
    if (!userId) {
      throw new Error('User ID not found in token');
    }
    return this.conversationService.listConversations(
      userId,
      data.include_archived || false,
      data.page_size || 50,
      data.page_token,
    );
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
    const addedBy = context?.user?.userId;
    return this.conversationService.addMembers(
      data.conversation_id,
      data.user_ids,
      data.role || 'MEMBER',
      addedBy,
    );
  }
}

