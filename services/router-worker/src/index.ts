import { Kafka, Consumer, EachMessagePayload, Producer } from 'kafkajs';
import { MongoClient, Db, Collection } from 'mongodb';

interface Destination {
  user_id: string;
  channels: Array<{
    channel: string;
    channel_user_id?: string;
    display_name?: string | null;
  }>;
}

interface MessageEvent {
  message_id: string;
  conversation_id: string;
  from: string;
  to: Destination[];
  channels: string[];
  payload: any;
  metadata?: Record<string, string>;
  timestamp: number;
  status?: string;
}

interface ChannelAdapter {
  sendMessage(payload: {
    conversationId: string;
    messageId: string;
    from: string;
    to: string;
    text?: string;
    metadata?: Record<string, any>;
  }): Promise<{ status: 'DELIVERED' | 'SENT' | 'FAILED'; deliveredAt?: number }>;
  sendFile(payload: {
    conversationId: string;
    messageId: string;
    from: string;
    to: string;
    fileUrl: string;
    mimeType: string;
    size: number;
    metadata?: Record<string, any>;
  }): Promise<{ status: 'DELIVERED' | 'SENT' | 'FAILED'; deliveredAt?: number }>;
}

class MockAdapter implements ChannelAdapter {
  constructor(private readonly type: string) {}

  async sendMessage(payload: any) {
    // Simular entrega
    const delay = Math.floor(Math.random() * 300) + 100;
    await new Promise((r) => setTimeout(r, delay));
    return { status: 'DELIVERED', deliveredAt: Date.now() };
  }

  async sendFile(payload: any) {
    const delay = Math.floor(Math.random() * 300) + 100;
    await new Promise((r) => setTimeout(r, delay));
    return { status: 'DELIVERED', deliveredAt: Date.now() };
  }
}

class RouterWorker {
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private mongoClient: MongoClient;
  private db!: Db;
  private dbName: string;
  private messagesCollection!: Collection;
  private adapters: Record<string, ChannelAdapter> = {
    whatsapp: new MockAdapter('whatsapp'),
    instagram: new MockAdapter('instagram'),
    telegram: new MockAdapter('telegram'),
  };
  private isRunning = false;

  constructor() {
    // Configurar Kafka
    const broker = process.env.KAFKA_BROKER || 'localhost:9092';
    const clientId = process.env.KAFKA_CLIENT_ID || 'router-worker';
    const groupId = process.env.KAFKA_CONSUMER_GROUP_ID || 'router-worker-group';

    console.log('========================================');
    console.log(`[RouterWorker] Configurando Kafka - broker: ${broker}, clientId: ${clientId}, groupId: ${groupId}`);
    console.log('========================================');

    this.kafka = new Kafka({
      clientId,
      brokers: [broker],
      connectionTimeout: 10000,
      requestTimeout: 30000,
      retry: {
        retries: 10,
        initialRetryTime: 300,
      },
    });

    this.consumer = this.kafka.consumer({ groupId });
    this.producer = this.kafka.producer();

    // Configurar MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/app_db';
    const dbName = process.env.MONGO_DBNAME || 'app_db';

    console.log(`[RouterWorker] Configurando MongoDB - uri: ${mongoUri}, dbName: ${dbName}`);

    this.mongoClient = new MongoClient(mongoUri);
    this.dbName = dbName;
  }

  private async waitForKafka(maxRetries: number = 30, delayMs: number = 2000): Promise<void> {
    const broker = process.env.KAFKA_BROKER || 'localhost:9092';
    console.log(`[RouterWorker] Aguardando Kafka estar disponível em ${broker}...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const adminClient = this.kafka.admin();
        await adminClient.connect();
        await adminClient.listTopics();
        await adminClient.disconnect();
        console.log(`[RouterWorker] Kafka está disponível após ${attempt} tentativa(s)`);
        return;
      } catch (error) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          throw new Error(`Kafka não está disponível após ${maxRetries} tentativas`);
        }
      }
    }
  }

  async connect(): Promise<void> {
    try {
      // Conectar ao MongoDB
      console.log('[RouterWorker] Conectando ao MongoDB...');
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(this.dbName);
      this.messagesCollection = this.db.collection('messages');
      console.log('[RouterWorker] Conectado ao MongoDB');

      // Aguardar e conectar Kafka
      await this.waitForKafka();
      console.log('[RouterWorker] Conectando ao Kafka...');
      await this.consumer.connect();
      await this.producer.connect();
      console.log('[RouterWorker] Conectado ao Kafka');

      // Subscrever ao tópico de roteamento
      const topic = 'messages.routing';
      console.log(`[RouterWorker] Subscrevendo ao tópico: ${topic}`);
      await this.consumer.subscribe({ topic, fromBeginning: false });
      console.log('[RouterWorker] Inscrito com sucesso');
    } catch (error) {
      console.error('[RouterWorker] Erro ao conectar:', error);
      throw error;
    }
  }

  async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const messageId = message.headers?.['message-id']?.toString() || 'unknown';

    try {
      console.log(
        `[RouterWorker] Processando mensagem - topic: ${topic}, message_id: ${messageId}`,
      );

      const event: MessageEvent = JSON.parse(message.value?.toString() || '{}');

      // Para cada destinatário e canal, enviar via adapter
      for (const destination of event.to || []) {
        for (const channelCfg of destination.channels || []) {
          const adapter = this.adapters[channelCfg.channel.toLowerCase()];
          if (!adapter) {
            console.warn(`[RouterWorker] Adapter não encontrado para canal ${channelCfg.channel}`);
            continue;
          }

          const isFile = !!event.payload?.file;
          const result = isFile
            ? await adapter.sendFile({
                conversationId: event.conversation_id,
                messageId: event.message_id,
                from: event.from,
                to: channelCfg.channel_user_id || destination.user_id,
                fileUrl: event.payload?.file?.url || event.payload?.file?.file_id,
                mimeType: event.payload?.file?.mime_type || 'application/octet-stream',
                size: event.payload?.file?.size || 0,
                metadata: event.metadata,
              })
            : await adapter.sendMessage({
                conversationId: event.conversation_id,
                messageId: event.message_id,
                from: event.from,
                to: channelCfg.channel_user_id || destination.user_id,
                text: event.payload?.text,
                metadata: event.metadata,
              });

          // Atualizar status por canal
          const deliveredAt = result.deliveredAt ? new Date(result.deliveredAt) : new Date();
          await this.messagesCollection.updateOne(
            { message_id: event.message_id, conversation_id: event.conversation_id },
            {
              $set: {
                status: result.status === 'DELIVERED' ? 'DELIVERED' : 'SENT',
                updated_at: new Date(),
              },
              $push: {
                delivery_metadata: {
                  channel: channelCfg.channel,
                  delivered_at: deliveredAt,
                  status: result.status,
                  target: channelCfg.channel_user_id || destination.user_id,
                },
              },
            },
          );

          // Publicar evento de entrega
          await this.producer.send({
            topic: 'messages.delivery',
            messages: [
              {
                key: event.conversation_id,
                value: JSON.stringify({
                  message_id: event.message_id,
                  conversation_id: event.conversation_id,
                  status: result.status,
                  channel: channelCfg.channel,
                  to: destination.user_id,
                  timestamp: deliveredAt.getTime(),
                }),
              },
            ],
          });
        }
      }

    } catch (error) {
      console.error(
        `[RouterWorker] Erro ao processar mensagem - message_id: ${messageId}`,
        error,
      );
      // Não lançar erro para não travar o consumer, em prod usar DLQ
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      await this.connect();
      this.isRunning = true;

      console.log('[RouterWorker] Iniciando loop de consumo...');
      await this.consumer.run({
        eachMessage: async (payload) => {
          await this.processMessage(payload);
        },
      });
    } catch (error) {
      console.error('[RouterWorker] Erro fatal ao iniciar:', error);
      this.isRunning = false;
      throw error;
    }
  }
}

const worker = new RouterWorker();
worker.start().catch(console.error);

