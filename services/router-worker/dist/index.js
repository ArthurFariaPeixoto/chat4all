"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const kafkajs_1 = require("kafkajs");
const mongodb_1 = require("mongodb");
class RouterWorker {
    constructor() {
        this.isRunning = false;
        const broker = process.env.KAFKA_BROKER || 'localhost:9092';
        const clientId = process.env.KAFKA_CLIENT_ID || 'router-worker';
        const groupId = process.env.KAFKA_CONSUMER_GROUP_ID || 'router-worker-group';
        console.log('========================================');
        console.log(`[RouterWorker] Configurando Kafka - broker: ${broker}, clientId: ${clientId}, groupId: ${groupId}`);
        console.log('========================================');
        this.kafka = new kafkajs_1.Kafka({
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
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/app_db';
        const dbName = process.env.MONGO_DBNAME || 'app_db';
        console.log(`[RouterWorker] Configurando MongoDB - uri: ${mongoUri}, dbName: ${dbName}`);
        this.mongoClient = new mongodb_1.MongoClient(mongoUri);
        this.dbName = dbName;
    }
    async waitForKafka(maxRetries = 30, delayMs = 2000) {
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
            }
            catch (error) {
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                else {
                    throw new Error(`Kafka não está disponível após ${maxRetries} tentativas`);
                }
            }
        }
    }
    async connect() {
        try {
            console.log('[RouterWorker] Conectando ao MongoDB...');
            await this.mongoClient.connect();
            this.db = this.mongoClient.db(this.dbName);
            this.messagesCollection = this.db.collection('messages');
            console.log('[RouterWorker] Conectado ao MongoDB');
            await this.waitForKafka();
            console.log('[RouterWorker] Conectando ao Kafka...');
            await this.consumer.connect();
            await this.producer.connect();
            console.log('[RouterWorker] Conectado ao Kafka');
            const topic = 'messages.routing';
            console.log(`[RouterWorker] Subscrevendo ao tópico: ${topic}`);
            await this.consumer.subscribe({ topic, fromBeginning: false });
            console.log('[RouterWorker] Inscrito com sucesso');
        }
        catch (error) {
            console.error('[RouterWorker] Erro ao conectar:', error);
            throw error;
        }
    }
    async processMessage(payload) {
        const { topic, partition, message } = payload;
        const messageId = message.headers?.['message-id']?.toString() || 'unknown';
        try {
            console.log(`[RouterWorker] Processando mensagem - topic: ${topic}, message_id: ${messageId}`);
            const event = JSON.parse(message.value?.toString() || '{}');
            const delay = Math.floor(Math.random() * 500) + 100;
            await new Promise(resolve => setTimeout(resolve, delay));
            const result = await this.messagesCollection.updateOne({ message_id: event.message_id, conversation_id: event.conversation_id }, {
                $set: {
                    status: 'DELIVERED',
                    updated_at: new Date(),
                    delivery_metadata: {
                        delivered_at: new Date(),
                        connector_delay: delay,
                        simulated: true
                    }
                }
            });
            if (result.modifiedCount > 0) {
                console.log(`[RouterWorker] Status atualizado para DELIVERED - message_id: ${messageId}`);
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
            }
            else {
                console.warn(`[RouterWorker] Mensagem não encontrada para atualização - message_id: ${messageId}`);
            }
        }
        catch (error) {
            console.error(`[RouterWorker] Erro ao processar mensagem - message_id: ${messageId}`, error);
        }
    }
    async start() {
        if (this.isRunning)
            return;
        try {
            await this.connect();
            this.isRunning = true;
            console.log('[RouterWorker] Iniciando loop de consumo...');
            await this.consumer.run({
                eachMessage: async (payload) => {
                    await this.processMessage(payload);
                },
            });
        }
        catch (error) {
            console.error('[RouterWorker] Erro fatal ao iniciar:', error);
            this.isRunning = false;
            throw error;
        }
    }
}
const worker = new RouterWorker();
worker.start().catch(console.error);
//# sourceMappingURL=index.js.map