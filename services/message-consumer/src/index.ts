import { Kafka, Consumer, EachMessagePayload, Producer } from 'kafkajs';
import { MongoClient, Db, Collection } from 'mongodb';

interface MessageEvent {
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
  timestamp: number;
}

interface MessageDocument {
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
  timestamp: number;
  created_at: Date;
  seq?: number;
  status?: string;
}

class MessageConsumer {
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private mongoClient: MongoClient;
  private db!: Db;
  private dbName: string;
  private messagesCollection!: Collection<MessageDocument>;
  private isRunning = false;

  constructor() {
    // Configurar Kafka - usar variável de ambiente ou padrão
    const broker = process.env.KAFKA_BROKER || 'localhost:9092';
    const clientId = process.env.KAFKA_CLIENT_ID || 'message-consumer';
    const groupId = process.env.KAFKA_CONSUMER_GROUP_ID || 'message-consumer-group';

    console.log('========================================');
    console.log(`[MessageConsumer] Configurando Kafka - broker: ${broker}, clientId: ${clientId}, groupId: ${groupId}`);
    console.log('========================================');

    this.kafka = new Kafka({
      clientId,
      brokers: [broker],
      connectionTimeout: 10000, // Aumentado para 10 segundos
      requestTimeout: 30000,
      retry: {
        retries: 10, // Aumentado número de retries
        initialRetryTime: 300, // Aumentado tempo inicial
        multiplier: 2,
        maxRetryTime: 30000,
      },
      enforceRequestTimeout: true,
    });

    this.consumer = this.kafka.consumer({ groupId });
    this.producer = this.kafka.producer();

    // Configurar MongoDB - usar variável de ambiente ou padrão
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/app_db';
    const dbName = process.env.MONGO_DBNAME || 'app_db';

    console.log(`[MessageConsumer] Configurando MongoDB - uri: ${mongoUri}, dbName: ${dbName}`);

    this.mongoClient = new MongoClient(mongoUri);
    this.dbName = dbName;
  }

  /**
   * Aguarda o Kafka estar disponível antes de tentar conectar
   */
  private async waitForKafka(maxRetries: number = 30, delayMs: number = 2000): Promise<void> {
    const broker = process.env.KAFKA_BROKER || 'localhost:9092';
    
    console.log(`[MessageConsumer] Aguardando Kafka estar disponível em ${broker}...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Tentar criar um admin client temporário para verificar conexão
        const adminClient = this.kafka.admin();
        await adminClient.connect();
        await adminClient.listTopics();
        await adminClient.disconnect();
        console.log(`[MessageConsumer] Kafka está disponível após ${attempt} tentativa(s)`);
        return;
      } catch (error) {
        if (attempt < maxRetries) {
          console.log(`[MessageConsumer] Tentativa ${attempt}/${maxRetries} - Kafka ainda não está pronto, aguardando ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          console.error(`[MessageConsumer] Kafka não está disponível após ${maxRetries} tentativas`);
          throw new Error(`Kafka não está disponível em ${broker} após ${maxRetries} tentativas: ${error}`);
        }
      }
    }
  }

  async connect(): Promise<void> {
    try {
      // Conectar ao MongoDB
      console.log('[MessageConsumer] Conectando ao MongoDB...');
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(this.dbName);
      this.messagesCollection = this.db.collection<MessageDocument>('messages');

      // Criar índices
      // Em sharded clusters, índices únicos devem incluir a shard key como prefixo
      // Como estamos shardando por conversation_id (hashed), não podemos criar índice único apenas em message_id
      // A solução é criar um índice composto ou garantir unicidade na aplicação
      
      try {
        // Criar índice único composto incluindo a shard key (conversation_id) é uma opção,
        // mas o message_id globalmente único é o ideal.
        // No entanto, o MongoDB exige que índices únicos em coleções shardadas contenham a shard key.
        
        // Tentativa 1: Índice único composto (melhor esforço para unicidade no cluster)
        // Nota: Isso garante unicidade do message_id APENAS dentro da mesma conversation_id
        await this.messagesCollection.createIndex({ conversation_id: 1, message_id: 1 }, { unique: true });
        
        // Para consultas rápidas por message_id (sem garantir unicidade global via constraint do banco)
        await this.messagesCollection.createIndex({ message_id: 1 });

      } catch (e: any) {
        console.warn('[MessageConsumer] Aviso ao criar índices de message_id:', e.message);
      }

      await this.messagesCollection.createIndex({ conversation_id: 1, timestamp: -1 });
      await this.messagesCollection.createIndex({ conversation_id: 1, seq: 1 });
      console.log('[MessageConsumer] Índices criados no MongoDB');

      // Aguardar Kafka estar disponível antes de conectar
      await this.waitForKafka();

      // Conectar ao Kafka
      console.log('[MessageConsumer] Conectando ao Kafka...');
      await this.consumer.connect();
      await this.producer.connect();
      console.log('[MessageConsumer] Conectado ao Kafka (Consumer e Producer)');

      // Subscrever ao tópico
      const topic = 'messages.send';
      console.log(`[MessageConsumer] Subscrevendo ao tópico: ${topic}`);
      await this.consumer.subscribe({ topic, fromBeginning: false });
      console.log('[MessageConsumer] Inscrito no tópico com sucesso');
    } catch (error) {
      console.error('[MessageConsumer] Erro ao conectar:', error);
      throw error;
    }
  }

  async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const messageId = message.headers?.['message-id']?.toString() || 'unknown';
    const conversationId = message.headers?.['conversation-id']?.toString() || 'unknown';

    try {
      console.log(
        `[MessageConsumer] Processando mensagem - topic: ${topic}, partition: ${partition}, offset: ${message.offset}, message_id: ${messageId}`,
      );

      // Parse da mensagem
      const event: MessageEvent = JSON.parse(message.value?.toString() || '{}');

      // Validações básicas
      if (!event.message_id || !event.conversation_id || !event.from) {
        console.error(`[MessageConsumer] Mensagem inválida: campos obrigatórios faltando`, event);
        return; // DLQ em um cenário real
      }

      // Verificar se a mensagem já foi processada (idempotência)
      const existingMessage = await this.messagesCollection.findOne({
        message_id: event.message_id,
      });

      if (existingMessage) {
        console.log(`[MessageConsumer] Mensagem já processada - message_id: ${event.message_id}, ignorando...`);
        return;
      }

      // Calcular seq baseado no número de mensagens na conversa
      const conversationMessageCount = await this.messagesCollection.countDocuments({
        conversation_id: event.conversation_id,
      });
      const seq = conversationMessageCount + 1;

      // Criar documento para MongoDB
      const document: MessageDocument = {
        message_id: event.message_id,
        conversation_id: event.conversation_id,
        from: event.from,
        to: event.to,
        channels: event.channels,
        payload: event.payload,
        metadata: event.metadata || {},
        timestamp: event.timestamp,
        created_at: new Date(),
        seq,
        status: 'SENT', // Status atualizado conforme requisito
      };

      // Salvar no MongoDB
      await this.messagesCollection.insertOne(document);

      console.log(
        `[MessageConsumer] Mensagem persistida no MongoDB - message_id: ${event.message_id}, status: SENT`,
      );

      // Encaminhar para o próximo estágio (Router/Connector)
      const routingTopic = 'messages.routing';
      await this.producer.send({
        topic: routingTopic,
        messages: [{
          key: event.conversation_id,
          value: JSON.stringify({ ...event, status: 'SENT' }),
          headers: message.headers,
        }],
      });

      console.log(`[MessageConsumer] Mensagem encaminhada para ${routingTopic} - message_id: ${event.message_id}`);

    } catch (error) {
      console.error(
        `[MessageConsumer] Erro ao processar mensagem - message_id: ${messageId}, conversation_id: ${conversationId}`,
        error,
      );
      // Em produção, você pode querer enviar para uma DLQ (Dead Letter Queue)
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MessageConsumer] Consumer já está rodando');
      return;
    }

    try {
      await this.connect();
      this.isRunning = true;

      console.log('[MessageConsumer] Iniciando consumo de mensagens...');

      await this.consumer.run({
        eachMessage: async (payload) => {
          try {
            await this.processMessage(payload);
          } catch (error) {
            console.error('[MessageConsumer] Erro ao processar mensagem:', error);
            // Continuar processando outras mensagens mesmo se uma falhar
          }
        },
      });

      console.log('[MessageConsumer] Consumer iniciado e aguardando mensagens...');
    } catch (error) {
      console.error('[MessageConsumer] Erro ao iniciar consumer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[MessageConsumer] Parando consumer...');
    this.isRunning = false;

    try {
      await this.consumer.disconnect();
      await this.producer.disconnect();
      console.log('[MessageConsumer] Desconectado do Kafka');
    } catch (error) {
      console.error('[MessageConsumer] Erro ao desconectar do Kafka:', error);
    }

    try {
      await this.mongoClient.close();
      console.log('[MessageConsumer] Desconectado do MongoDB');
    } catch (error) {
      console.error('[MessageConsumer] Erro ao desconectar do MongoDB:', error);
    }

    console.log('[MessageConsumer] Consumer parado');
  }
}

// Handler para encerramento gracioso
const consumer = new MessageConsumer();

process.on('SIGINT', async () => {
  console.log('\n[MessageConsumer] Recebido SIGINT, encerrando graciosamente...');
  await consumer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[MessageConsumer] Recebido SIGTERM, encerrando graciosamente...');
  await consumer.stop();
  process.exit(0);
});

// Iniciar consumer
consumer
  .start()
  .then(() => {
    console.log('[MessageConsumer] Consumer iniciado com sucesso!');
  })
  .catch((error) => {
    console.error('[MessageConsumer] Erro fatal ao iniciar consumer:', error);
    process.exit(1);
  });

