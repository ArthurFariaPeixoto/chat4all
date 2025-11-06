import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ConversationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Converte tipo de conversa para formato enum do proto
   */
  private convertConversationType(type: string): string {
    const upperType = type.toUpperCase();
    if (upperType === 'PRIVATE') {
      return 'CONVERSATION_TYPE_PRIVATE';
    } else if (upperType === 'GROUP') {
      return 'CONVERSATION_TYPE_GROUP';
    }
    return 'CONVERSATION_TYPE_UNSPECIFIED';
  }

  /**
   * Converte role de membro para formato enum do proto
   */
  private convertMemberRole(role: string): string {
    const upperRole = role.toUpperCase();
    if (upperRole === 'OWNER') {
      return 'MEMBER_ROLE_OWNER';
    } else if (upperRole === 'ADMIN') {
      return 'MEMBER_ROLE_ADMIN';
    } else if (upperRole === 'MEMBER') {
      return 'MEMBER_ROLE_MEMBER';
    }
    return 'MEMBER_ROLE_UNSPECIFIED';
  }

  /**
   * Cria uma nova conversa (privada ou grupo)
   */
  async createConversation(
    type: string,
    memberIds: string[],
    createdBy: string,
    name?: string,
    metadata?: Record<string, string>,
  ) {
    // Validação de tipo
    if (type !== 'PRIVATE' && type !== 'GROUP') {
      throw new BadRequestException('Invalid conversation type. Must be PRIVATE or GROUP');
    }

    // Para grupos, nome é obrigatório
    if (type === 'GROUP' && !name) {
      throw new BadRequestException('Group conversations require a name');
    }

    // Para conversas privadas, deve ter exatamente 2 membros
    if (type === 'PRIVATE' && memberIds.length !== 2) {
      throw new BadRequestException('Private conversations must have exactly 2 members');
    }

    // Validar que todos os membros existem
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: memberIds },
      },
    });

    if (users.length !== memberIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    // Verificar se o criador está na lista de membros
    if (!memberIds.includes(createdBy)) {
      throw new BadRequestException('Creator must be in the members list');
    }

    const creatorId = createdBy;

    // Criar conversa e membros em uma transação
    const conversation = await this.prisma.$transaction(async (tx) => {
      // Criar conversa
      const newConversation = await tx.conversation.create({
        data: {
          id: uuidv4(),
          type,
          name,
          createdBy: creatorId,
          metadata: metadata || {},
        },
      });

      // Criar membros
      const members = await Promise.all(
        memberIds.map((userId, index) =>
          tx.conversationMember.create({
            data: {
              id: uuidv4(),
              conversationId: newConversation.id,
              userId,
              role: userId === creatorId ? 'OWNER' : 'MEMBER',
            },
          }),
        ),
      );

      return {
        conversation: newConversation,
        members,
      };
    });

    return {
      conversation_id: conversation.conversation.id,
      created_at: Math.floor(conversation.conversation.createdAt.getTime() / 1000),
    };
  }

  /**
   * Obtém detalhes de uma conversa
   */
  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                email: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Sempre validar que o usuário é membro da conversa
    const isMember = conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new NotFoundException('Conversation not found or access denied');
    }

    // Converter para formato gRPC
    return {
      conversation: {
        id: conversation.id,
        type: this.convertConversationType(conversation.type),
        name: conversation.name || undefined,
        members: conversation.members.map((m) => ({
          user_id: m.userId,
          role: this.convertMemberRole(m.role),
          joined_at: Math.floor(m.joinedAt.getTime() / 1000),
          last_read_seq: Number(m.lastReadSeq || 0),
          last_delivered_seq: Number(m.lastDeliveredSeq || 0),
        })),
        metadata: (conversation.metadata as Record<string, string>) || {},
        created_at: Math.floor(conversation.createdAt.getTime() / 1000),
        created_by: conversation.createdBy,
        archived: conversation.archived,
      },
    };
  }

  /**
   * Lista conversas de um usuário
   */
  async listConversations(
    userId: string,
    includeArchived: boolean = false,
    pageSize: number = 50,
    pageToken?: string,
  ) {
    // Validar que o usuário existe
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Construir condições
    const where: any = {
      members: {
        some: {
          userId,
        },
      },
    };

    if (!includeArchived) {
      where.archived = false;
    }

    // Paginação simples (em produção, usar cursor-based)
    const skip = pageToken ? parseInt(pageToken, 10) : 0;
    const take = Math.min(pageSize, 100); // Max 100

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          members: {
            // Retornar TODOS os membros da conversa, não apenas o usuário logado
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    // Converter para formato gRPC
    const formattedConversations = conversations.map((conv) => ({
      id: conv.id,
      type: this.convertConversationType(conv.type),
      name: conv.name || undefined,
      members: conv.members.map((m) => ({
        user_id: m.userId,
        role: this.convertMemberRole(m.role),
        joined_at: Math.floor(m.joinedAt.getTime() / 1000),
        last_read_seq: Number(m.lastReadSeq || 0),
        last_delivered_seq: Number(m.lastDeliveredSeq || 0),
      })),
      metadata: (conv.metadata as Record<string, string>) || {},
      created_at: Math.floor(conv.createdAt.getTime() / 1000),
      created_by: conv.createdBy,
      archived: conv.archived,
    }));

    // Calcular próximo token de página
    const nextPageToken =
      skip + take < total ? String(skip + take) : undefined;

    return {
      conversations: formattedConversations,
      next_page_token: nextPageToken,
      total_count: total,
    };
  }

  /**
   * Adiciona membros a uma conversa
   */
  async addMembers(
    conversationId: string,
    userIds: string[],
    role: string = 'MEMBER',
    addedBy?: string,
  ) {
    // Verificar se a conversa existe
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Verificar permissões (apenas ADMIN ou OWNER podem adicionar membros)
    if (addedBy) {
      const adder = conversation.members.find((m) => m.userId === addedBy);
      if (!adder || (adder.role !== 'ADMIN' && adder.role !== 'OWNER')) {
        throw new BadRequestException('Only admins and owners can add members');
      }
    }

    // Validar que os usuários existem
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
    });

    if (users.length !== userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    // Verificar se algum usuário já é membro
    const existingMembers = conversation.members
      .filter((m) => userIds.includes(m.userId))
      .map((m) => m.userId);

    if (existingMembers.length > 0) {
      throw new BadRequestException(
        `Users already members: ${existingMembers.join(', ')}`,
      );
    }

    // Adicionar membros
    const newMembers = await Promise.all(
      userIds.map((userId) =>
        this.prisma.conversationMember.create({
          data: {
            id: uuidv4(),
            conversationId,
            userId,
            role,
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        }),
      ),
    );

    return {
      added_members: newMembers.map((m) => ({
        user_id: m.userId,
        role: this.convertMemberRole(m.role),
        joined_at: Math.floor(m.joinedAt.getTime() / 1000),
        last_read_seq: Number(m.lastReadSeq || 0),
        last_delivered_seq: Number(m.lastDeliveredSeq || 0),
      })),
    };
  }
}

