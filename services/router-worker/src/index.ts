import { Kafka, Consumer, EachMessagePayload, Producer } from 'kafkajs';
import { MongoClient, Db, Collection } from 'mongodb';

interface MessageEvent {
  message_id: string;
  conversation_id: string;
  from: string;
  to: string[];
  channels: string[];
  payload: any;
  metadata?: Record<string, string>;
  timestamp: number;
  status?: string;
}

class RouterWorker {
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private mongoClient: MongoClient;
  private db!: Db;
  private dbName: string;
  private messagesCollection!: Collection;
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

      // Simular envio para conector (delay aleatório)
      const delay = Math.floor(Math.random() * 500) + 100; // 100-600ms
      await new Promise(resolve => setTimeout(resolve, delay));

      // Atualizar status no MongoDB
      const result = await this.messagesCollection.updateOne(
        { message_id: event.message_id, conversation_id: event.conversation_id },
        { 
          $set: { 
            status: 'DELIVERED',
            updated_at: new Date(),
            delivery_metadata: {
              delivered_at: new Date(),
              connector_delay: delay,
              simulated: true
            }
          } 
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`[RouterWorker] Status atualizado para DELIVERED - message_id: ${messageId}`);
        
        // Publicar evento de entrega (opcional)
        await this.producer.send({
          topic: 'messages.delivery',
          messages: [{
            key: event.conversation_id,
            value: JSON.stringify({
              message_id: event.message_id,
              conversation_id: event.conversation_id,
              status: 'DELIVERED',
              timestamp: Date.now()
            })
          }]
        });
      } else {
        console.warn(`[RouterWorker] Mensagem não encontrada para atualização - message_id: ${messageId}`);
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

