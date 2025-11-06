import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { MongoDBService, MessageDocument } from '../mongodb/mongodb.service';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private prisma: PrismaService,
    private kafkaProducer: KafkaProducerService,
    private mongoDBService: MongoDBService,
  ) {}

  /**
   * Envia uma mensagem (publica evento no Kafka)
   */
  async sendMessage(
    messageId: string,
    conversationId: string,
    userId: string,
    channels: string[],
    payload: {
      type: string;
      text?: string;
      file?: any;
      location?: any;
      contact?: any;
    },
    metadata?: Record<string, string>,
  ) {
    this.logger.log(`[sendMessage] Iniciando processamento - message_id: ${messageId}, conversation_id: ${conversationId}, userId: ${userId}`);

    // Validar que a conversa existe
    this.logger.debug(`[sendMessage] Buscando conversa no banco - conversation_id: ${conversationId}`);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: true,
      },
    });

    if (!conversation) {
      this.logger.error(`[sendMessage] Conversa não encontrada - conversation_id: ${conversationId}`);
      throw new NotFoundException('Conversation not found');
    }

    this.logger.debug(`[sendMessage] Conversa encontrada - conversation_id: ${conversationId}, membros: ${conversation.members.length}`);

    // Validar que o remetente é membro da conversa
    const sender = conversation.members.find((m) => m.userId === userId);
    if (!sender) {
      this.logger.error(`[sendMessage] Usuário não é membro da conversa - userId: ${userId}, conversation_id: ${conversationId}`);
      throw new BadRequestException('User is not a member of this conversation');
    }

    this.logger.debug(`[sendMessage] Remetente validado - userId: ${userId}`);

    // Validar payload
    this.logger.debug(`[sendMessage] Validando payload - type original: ${payload.type}`);
    this.validatePayload(payload);
    this.logger.debug(`[sendMessage] Payload validado com sucesso - type normalizado: ${payload.type}`);

    // Validar canais
    const validChannels = ['whatsapp', 'telegram', 'instagram', 'all'];
    const invalidChannels = channels.filter((c) => !validChannels.includes(c.toLowerCase()));
    if (invalidChannels.length > 0) {
      this.logger.error(`[sendMessage] Canais inválidos - channels: ${channels.join(', ')}, inválidos: ${invalidChannels.join(', ')}`);
      throw new BadRequestException(`Invalid channels: ${invalidChannels.join(', ')}`);
    }

    this.logger.debug(`[sendMessage] Canais validados - channels: ${channels.join(', ')}`);

    // Criar evento para Kafka - conversation_id e from, o worker buscará os membros para calcular destinatários
    const event = {
      message_id: messageId,
      conversation_id: conversationId,
      from: userId,
      channels: channels.map((c) => c.toLowerCase()),
      payload: {
        type: payload.type,
        text: payload.text,
        file: payload.file,
        location: payload.location,
        contact: payload.contact,
      },
      metadata: metadata || {},
      timestamp: Date.now(),
    };

    this.logger.log(`[sendMessage] Evento criado - message_id: ${messageId}, preparando para publicar no Kafka`);
    this.logger.debug(`[sendMessage] Evento completo: ${JSON.stringify(event)}`);

    // Publicar evento no Kafka
    try {
      this.logger.log(`[sendMessage] Publicando evento no Kafka - message_id: ${messageId}, topic: messages.send`);
      const publishResult = await this.kafkaProducer.publishMessageEvent(event);
      this.logger.log(`[sendMessage] Evento publicado com sucesso no Kafka - message_id: ${messageId}`);
      this.logger.debug(`[sendMessage] Resultado da publicação: ${JSON.stringify(publishResult)}`);

      // Retornar resposta imediata
      const response = {
        message_id: messageId,
        status: 'ACCEPTED', // Status inicial - será atualizado pelo worker
        timestamp: Math.floor(Date.now() / 1000),
        seq: 0, // Será gerado pelo worker
      };
      
      this.logger.log(`[sendMessage] Processamento concluído com sucesso - message_id: ${messageId}, status: ${response.status}`);
      return response;
    } catch (error) {
      this.logger.error(`[sendMessage] Erro ao publicar no Kafka - message_id: ${messageId}`, error.stack || error.message);
      this.logger.error(`[sendMessage] Detalhes do erro: ${JSON.stringify(error)}`);
      throw new BadRequestException(`Failed to publish message: ${error.message}`);
    }
  }

  /**
   * Converte o tipo de mensagem do protobuf para o formato esperado
   */
  private normalizeMessageType(type: string | number): string {
    // Se já está no formato correto, retorna como está
    const normalized = typeof type === 'string' ? type.toUpperCase() : String(type);
    
    // Mapeamento de tipos do protobuf para valores esperados
    const typeMap: Record<string, string> = {
      'MESSAGE_TYPE_UNSPECIFIED': 'TEXT', // Default para TEXT se não especificado
      'MESSAGE_TYPE_TEXT': 'TEXT',
      'MESSAGE_TYPE_IMAGE': 'IMAGE',
      'MESSAGE_TYPE_VIDEO': 'VIDEO',
      'MESSAGE_TYPE_AUDIO': 'AUDIO',
      'MESSAGE_TYPE_DOCUMENT': 'DOCUMENT',
      'MESSAGE_TYPE_LOCATION': 'LOCATION',
      'MESSAGE_TYPE_CONTACT': 'CONTACT',
      // Também aceita valores numéricos do enum
      '0': 'TEXT', // MESSAGE_TYPE_UNSPECIFIED -> TEXT
      '1': 'TEXT', // MESSAGE_TYPE_TEXT
      '2': 'IMAGE', // MESSAGE_TYPE_IMAGE
      '3': 'VIDEO', // MESSAGE_TYPE_VIDEO
      '4': 'AUDIO', // MESSAGE_TYPE_AUDIO
      '5': 'DOCUMENT', // MESSAGE_TYPE_DOCUMENT
      '6': 'LOCATION', // MESSAGE_TYPE_LOCATION
      '7': 'CONTACT', // MESSAGE_TYPE_CONTACT
    };

    // Se o tipo está no mapa, retorna o valor mapeado
    if (typeMap[normalized]) {
      return typeMap[normalized];
    }

    // Se já é um dos tipos válidos, retorna como está
    const validTypes = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT'];
    if (validTypes.includes(normalized)) {
      return normalized;
    }

    // Se não encontrou, retorna TEXT como padrão e loga um aviso
    this.logger.warn(`[normalizeMessageType] Tipo desconhecido: ${type}, usando TEXT como padrão`);
    return 'TEXT';
  }

  /**
   * Valida o payload da mensagem
   */
  private validatePayload(payload: {
    type: string;
    text?: string;
    file?: any;
    location?: any;
    contact?: any;
  }) {
    // Normalizar o tipo primeiro
    const normalizedType = this.normalizeMessageType(payload.type);
    payload.type = normalizedType;

    const validTypes = [
      'TEXT',
      'IMAGE',
      'VIDEO',
      'AUDIO',
      'DOCUMENT',
      'LOCATION',
      'CONTACT',
    ];

    if (!validTypes.includes(payload.type)) {
      throw new BadRequestException(`Invalid message type: ${payload.type}`);
    }

    // Validações específicas por tipo
    switch (payload.type) {
      case 'TEXT':
        if (!payload.text || payload.text.trim().length === 0) {
          throw new BadRequestException('Text message must have text content');
        }
        break;

      case 'IMAGE':
      case 'VIDEO':
      case 'AUDIO':
      case 'DOCUMENT':
        if (!payload.file || !payload.file.file_id) {
          throw new BadRequestException(`${payload.type} message must have file reference`);
        }
        break;

      case 'LOCATION':
        if (!payload.location || !payload.location.latitude || !payload.location.longitude) {
          throw new BadRequestException('Location message must have latitude and longitude');
        }
        break;

      case 'CONTACT':
        if (!payload.contact || !payload.contact.name) {
          throw new BadRequestException('Contact message must have contact name');
        }
        break;
    }
  }

  /**
   * Obtém mensagens de uma conversa
   */
  async getMessages(
    conversationId: string,
    userId: string,
    sinceSeq?: number,
    untilSeq?: number,
    limit: number = 50,
    reverse: boolean = false,
  ) {
    this.logger.log(
      `[getMessages] Buscando mensagens - conversation_id: ${conversationId}, userId: ${userId}, since_seq: ${sinceSeq}, until_seq: ${untilSeq}, limit: ${limit}, reverse: ${reverse}`,
    );

    // Validar que a conversa existe
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: true,
      },
    });

    if (!conversation) {
      this.logger.error(`[getMessages] Conversa não encontrada - conversation_id: ${conversationId}`);
      throw new NotFoundException('Conversation not found');
    }

    // Validar que o usuário é membro da conversa
    const isMember = conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      this.logger.error(`[getMessages] Usuário não é membro da conversa - userId: ${userId}, conversation_id: ${conversationId}`);
      throw new NotFoundException('Conversation not found or access denied');
    }

    // Validar e ajustar limit (máximo 100)
    const validLimit = Math.min(Math.max(1, limit), 100);
    this.logger.log(`[getMessages] Limit ajustado: ${validLimit} (original: ${limit})`);

    try {
      const messagesCollection = this.mongoDBService.getMessagesCollection();
      this.logger.log(`[getMessages] Coleção MongoDB obtida com sucesso`);

      // Verificar total de mensagens na conversa (para debug)
      const totalCount = await messagesCollection.countDocuments({ conversation_id: conversationId });
      this.logger.log(`[getMessages] Total de mensagens na conversa ${conversationId}: ${totalCount}`);

      // Construir query
      const query: any = {
        conversation_id: conversationId,
      };

      // Adicionar filtros de sequência
      if (sinceSeq !== undefined || untilSeq !== undefined) {
        query.seq = {};
        if (sinceSeq !== undefined) {
          query.seq.$gt = sinceSeq;
          this.logger.log(`[getMessages] Filtro since_seq aplicado: ${sinceSeq}`);
        }
        if (untilSeq !== undefined) {
          query.seq.$lte = untilSeq;
          this.logger.log(`[getMessages] Filtro until_seq aplicado: ${untilSeq}`);
        }
      }

      this.logger.log(`[getMessages] Query MongoDB: ${JSON.stringify(query)}`);

      // Verificar quantas mensagens correspondem à query (antes do limit)
      const queryCount = await messagesCollection.countDocuments(query);
      this.logger.log(`[getMessages] Mensagens que correspondem à query: ${queryCount}`);

      // Buscar mensagens (buscar uma a mais para verificar se há mais)
      // reverse = false: ordena por seq crescente (mais antigas primeiro)
      // reverse = true: ordena por seq decrescente (mais recentes primeiro)
      const sortOrder = reverse ? -1 : 1;
      this.logger.log(`[getMessages] Ordenação: ${sortOrder === 1 ? 'crescente (seq: 1)' : 'decrescente (seq: -1)'}`);
      
      const messages = await messagesCollection
        .find(query)
        .sort({ seq: sortOrder })
        .limit(validLimit + 1)
        .toArray();

      this.logger.log(`[getMessages] Mensagens encontradas no MongoDB: ${messages.length}`);
      
      if (messages.length > 0) {
        this.logger.log(`[getMessages] Primeira mensagem - seq: ${messages[0].seq}, message_id: ${messages[0].message_id}`);
        if (messages.length > 1) {
          this.logger.log(`[getMessages] Última mensagem - seq: ${messages[messages.length - 1].seq}, message_id: ${messages[messages.length - 1].message_id}`);
        }
      } else {
        this.logger.warn(`[getMessages] Nenhuma mensagem encontrada para a query`);
      }

      // Verificar se há mais mensagens
      const hasMore = messages.length > validLimit;
      const messagesToReturn = hasMore ? messages.slice(0, validLimit) : messages;
      this.logger.log(`[getMessages] Mensagens para retornar: ${messagesToReturn.length} (hasMore: ${hasMore})`);

      // Mapear documentos do MongoDB para o formato esperado pelo protobuf
      this.logger.log(`[getMessages] Iniciando mapeamento de ${messagesToReturn.length} mensagens`);
      const mappedMessages = messagesToReturn.map((doc: MessageDocument) => {
        // Converter tipo de mensagem para o formato do protobuf
        const messageTypeMap: Record<string, string> = {
          TEXT: 'MESSAGE_TYPE_TEXT',
          IMAGE: 'MESSAGE_TYPE_IMAGE',
          VIDEO: 'MESSAGE_TYPE_VIDEO',
          AUDIO: 'MESSAGE_TYPE_AUDIO',
          DOCUMENT: 'MESSAGE_TYPE_DOCUMENT',
          LOCATION: 'MESSAGE_TYPE_LOCATION',
          CONTACT: 'MESSAGE_TYPE_CONTACT',
        };

        const payloadType = messageTypeMap[doc.payload.type] || 'MESSAGE_TYPE_TEXT';

        // Converter status
        const statusMap: Record<string, string> = {
          ACCEPTED: 'MESSAGE_STATUS_ACCEPTED',
          SENT: 'MESSAGE_STATUS_SENT',
          DELIVERED: 'MESSAGE_STATUS_DELIVERED',
          READ: 'MESSAGE_STATUS_READ',
          FAILED: 'MESSAGE_STATUS_FAILED',
        };

        const messageStatus = statusMap[doc.status || 'ACCEPTED'] || 'MESSAGE_STATUS_ACCEPTED';

        // Converter timestamps (int64 em protobuf)
        const createdAt = doc.created_at instanceof Date 
          ? Math.floor(doc.created_at.getTime() / 1000)
          : doc.timestamp ? Math.floor(doc.timestamp / 1000) : Math.floor(Date.now() / 1000);

        return {
          message_id: doc.message_id,
          conversation_id: doc.conversation_id,
          from: doc.from,
          to: doc.to || [],
          payload: {
            type: payloadType,
            text: doc.payload.text,
            file: doc.payload.file,
            location: doc.payload.location,
            contact: doc.payload.contact,
          },
          metadata: doc.metadata || {},
          seq: doc.seq || 0,
          status: messageStatus,
          created_at: createdAt,
          delivered_at: undefined,
          read_at: undefined,
          channel_statuses: [],
        };
      });

      this.logger.log(`[getMessages] Mapeamento concluído: ${mappedMessages.length} mensagens mapeadas`);

      // Calcular next_seq se houver mais mensagens
      let nextSeq: number | undefined = undefined;
      if (hasMore && messagesToReturn.length > 0) {
        const lastMessage = messagesToReturn[messagesToReturn.length - 1];
        nextSeq = lastMessage.seq;
        this.logger.log(`[getMessages] next_seq calculado (hasMore=true): ${nextSeq}`);
      } else if (sinceSeq !== undefined && messagesToReturn.length > 0) {
        // Se não há mais mensagens mas foi usado sinceSeq, retornar o último seq
        const lastMessage = messagesToReturn[messagesToReturn.length - 1];
        nextSeq = lastMessage.seq;
        this.logger.log(`[getMessages] next_seq calculado (sinceSeq usado): ${nextSeq}`);
      } else {
        this.logger.log(`[getMessages] next_seq não calculado (sem mais mensagens)`);
      }

      const result = {
        messages: mappedMessages,
        has_more: hasMore,
        next_seq: nextSeq,
      };

      this.logger.log(
        `[getMessages] Retornando resultado - conversation_id: ${conversationId}, messages: ${result.messages.length}, has_more: ${result.has_more}, next_seq: ${result.next_seq}`,
      );

      return result;
    } catch (error) {
      this.logger.error(`[getMessages] Erro ao buscar mensagens - conversation_id: ${conversationId}`, error.stack || error.message);
      throw new BadRequestException(`Failed to retrieve messages: ${error.message}`);
    }
  }
}

