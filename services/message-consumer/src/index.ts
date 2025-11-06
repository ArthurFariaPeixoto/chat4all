import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
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
  private mongoClient: MongoClient;
  private db!: Db;
  private dbName: string;
  private messagesCollection!: Collection<MessageDocument>;
  private isRunning = false;

  constructor() {
    // Configurar Kafka - hardcoded para localhost
    // Usar porta 9093 que está configurada como PLAINTEXT_HOST no docker-compose
    const broker = 'localhost:9093';
    const clientId = 'message-consumer';
    const groupId = 'message-consumer-group';

    console.log('========================================');
    console.log(`[MessageConsumer] BROKER HARDCODED: ${broker}`);
    console.log(`[MessageConsumer] Configurando Kafka - broker: ${broker}, clientId: ${clientId}, groupId: ${groupId}`);
    console.log('========================================');

    this.kafka = new Kafka({
      clientId,
      brokers: [broker],
      connectionTimeout: 3000,
      requestTimeout: 30000,
      retry: {
        retries: 5,
        initialRetryTime: 100,
        multiplier: 2,
        maxRetryTime: 30000,
      },
      enforceRequestTimeout: true,
    });

    this.consumer = this.kafka.consumer({ groupId });

    // Configurar MongoDB - hardcoded para localhost
    const mongoUri = 'mongodb://localhost:27017/app_db';
    const dbName = 'app_db';

    console.log(`[MessageConsumer] Configurando MongoDB - uri: ${mongoUri}, dbName: ${dbName}`);

    this.mongoClient = new MongoClient(mongoUri);
    this.dbName = dbName;
  }

  async connect(): Promise<void> {
    try {
      // Conectar ao MongoDB
      console.log('[MessageConsumer] Conectando ao MongoDB...');
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(this.dbName);
      this.messagesCollection = this.db.collection<MessageDocument>('messages');

      // Criar índices
      await this.messagesCollection.createIndex({ message_id: 1 }, { unique: true });
      await this.messagesCollection.createIndex({ conversation_id: 1, timestamp: -1 });
      await this.messagesCollection.createIndex({ conversation_id: 1, seq: 1 });
      console.log('[MessageConsumer] Índices criados no MongoDB');

      // Conectar ao Kafka
      console.log('[MessageConsumer] Conectando ao Kafka...');
      await this.consumer.connect();
      console.log('[MessageConsumer] Conectado ao Kafka');

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
        status: 'ACCEPTED',
      };

      // Salvar no MongoDB
      await this.messagesCollection.insertOne(document);

      console.log(
        `[MessageConsumer] Mensagem salva no MongoDB - message_id: ${event.message_id}, conversation_id: ${event.conversation_id}, seq: ${seq}`,
      );
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

