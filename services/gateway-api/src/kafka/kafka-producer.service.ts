import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerConfig } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor(private configService: ConfigService) {
    const broker = this.configService.get<string>('KAFKA_BROKER', 'kafka:9092');
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'gateway-api');

    this.kafka = new Kafka({
      clientId,
      brokers: [broker],
      retry: {
        retries: 5,
        initialRetryTime: 100,
        multiplier: 2,
        maxRetryTime: 30000,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000,
    });
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', error);
    }
  }

  /**
   * Publica um evento de mensagem no tópico messages.send
   * @param event Dados do evento de mensagem
   * @returns Promise com informações da publicação
   */
  async publishMessageEvent(event: {
    message_id: string;
    conversation_id: string;
    from: string;
    to: string[];
    channels: string[];
    payload: {
      type: string;
      text?: string;
      file?: any;
      location?: any;
      contact?: any;
    };
    metadata?: Record<string, string>;
    priority?: string;
    timestamp: number;
  }) {
    const topic = 'messages.send';
    
    // Particionamento por conversation_id para garantir ordem
    const partition = this.getPartition(event.conversation_id);

    try {
      const result = await this.producer.send({
        topic,
        messages: [
          {
            key: event.conversation_id, // Chave para particionamento
            partition,
            value: JSON.stringify(event),
            headers: {
              'message-id': event.message_id,
              'conversation-id': event.conversation_id,
              'from': event.from,
              'timestamp': event.timestamp.toString(),
            },
          },
        ],
      });

      this.logger.debug(
        `Message event published: message_id=${event.message_id}, conversation_id=${event.conversation_id}, partition=${partition}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to publish message event: message_id=${event.message_id}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Calcula a partição baseada no conversation_id
   * Usa hash simples para distribuir uniformemente
   */
  private getPartition(conversationId: string): number {
    // Hash simples do conversation_id
    let hash = 0;
    for (let i = 0; i < conversationId.length; i++) {
      const char = conversationId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Número de partições do tópico (3 conforme docker-compose)
    const numPartitions = 3;
    return Math.abs(hash) % numPartitions;
  }

  /**
   * Verifica se o producer está conectado
   */
  async isConnected(): Promise<boolean> {
    try {
      // Tenta obter metadados para verificar conexão
      await this.producer.send({
        topic: 'messages.send',
        messages: [],
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

