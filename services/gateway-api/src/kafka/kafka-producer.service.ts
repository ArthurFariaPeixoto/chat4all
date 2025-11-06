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
    const broker = this.configService.get<string>('KAFKA_BROKER', 'kafka:9092');
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'gateway-api');
    
    this.logger.log(`[onModuleInit] Iniciando conexão com Kafka - broker: ${broker}, clientId: ${clientId}`);
    
    try {
      this.logger.debug(`[onModuleInit] Conectando producer...`);
      await this.producer.connect();
      this.logger.log(`[onModuleInit] Kafka producer conectado com sucesso - broker: ${broker}`);
    } catch (error) {
      this.logger.error(`[onModuleInit] Falha ao conectar Kafka producer - broker: ${broker}`, error.stack || error.message);
      this.logger.error(`[onModuleInit] Detalhes do erro: ${JSON.stringify(error)}`);
      
      // Em ambiente de teste, não lançar erro para permitir que os testes continuem
      // O Kafka pode não estar disponível em todos os ambientes de teste
      if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        this.logger.warn('[onModuleInit] Falha de conexão Kafka em ambiente de teste, continuando sem Kafka');
        return;
      }
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
    channels: string[];
    payload: {
      type: string;
      text?: string;
      file?: any;
      location?: any;
      contact?: any;
    };
    metadata?: Record<string, string>;
    timestamp: number;
  }) {
    const topic = 'messages.send';
    
    this.logger.log(`[publishMessageEvent] Iniciando publicação - message_id: ${event.message_id}, topic: ${topic}`);
    
    // Verificar se o producer está conectado
    if (!this.producer) {
      this.logger.error(`[publishMessageEvent] Producer não está inicializado`);
      throw new Error('Kafka producer is not initialized');
    }

    // Particionamento por conversation_id para garantir ordem
    const partition = this.getPartition(event.conversation_id);
    this.logger.debug(`[publishMessageEvent] Partição calculada - conversation_id: ${event.conversation_id}, partition: ${partition}`);

    const message = {
      key: event.conversation_id, // Chave para particionamento
      partition,
      value: JSON.stringify(event),
      headers: {
        'message-id': event.message_id,
        'conversation-id': event.conversation_id,
        'from': event.from,
        'timestamp': event.timestamp.toString(),
      },
    };

    this.logger.debug(`[publishMessageEvent] Mensagem preparada - key: ${message.key}, partition: ${message.partition}`);
    this.logger.debug(`[publishMessageEvent] Payload da mensagem: ${message.value}`);

    try {
      this.logger.log(`[publishMessageEvent] Enviando mensagem para o Kafka - message_id: ${event.message_id}`);
      const result = await this.producer.send({
        topic,
        messages: [message],
      });

      this.logger.log(
        `[publishMessageEvent] Mensagem publicada com sucesso - message_id=${event.message_id}, conversation_id=${event.conversation_id}, partition=${partition}, topic=${topic}`,
      );
      this.logger.debug(`[publishMessageEvent] Resultado completo: ${JSON.stringify(result)}`);

      // Log detalhado do resultado
      if (result && result.length > 0) {
        result.forEach((partitionResult, index) => {
          this.logger.debug(
            `[publishMessageEvent] Partição ${index} - topic: ${partitionResult.topicName}, partition: ${partitionResult.partition}, offset: ${partitionResult.baseOffset}`,
          );
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        `[publishMessageEvent] Falha ao publicar mensagem - message_id=${event.message_id}, topic=${topic}`,
        error.stack || error.message,
      );
      this.logger.error(`[publishMessageEvent] Detalhes do erro: ${JSON.stringify(error)}`);
      
      // Log adicional para erros específicos do Kafka
      if (error.name === 'KafkaJSNumberOfRetriesExceeded') {
        this.logger.error(`[publishMessageEvent] Número máximo de tentativas excedido - verifique conexão com Kafka`);
      } else if (error.name === 'KafkaJSTopicMetadataNotLoaded') {
        this.logger.error(`[publishMessageEvent] Tópico não encontrado - verifique se o tópico '${topic}' existe no Kafka`);
      } else if (error.name === 'KafkaJSConnectionError') {
        this.logger.error(`[publishMessageEvent] Erro de conexão com Kafka - verifique se o broker está acessível`);
      }
      
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

