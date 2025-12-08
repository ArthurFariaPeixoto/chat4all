import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db, Collection } from 'mongodb';

export interface MessageDocument {
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
  // Campos de entrega e leitura
  delivered_at?: Date;
  delivered_to?: string[];
  read_at?: Date;
  read_by?: string[];
  // Metadata de entrega (usado pelo router-worker)
  delivery_metadata?: {
    delivered_at?: Date | string;
    channel?: string;
  };
}

@Injectable()
export class MongoDBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoDBService.name);
  private mongoClient: MongoClient;
  private db!: Db;
  private messagesCollection!: Collection<MessageDocument>;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      // Usar variável de ambiente MONGODB_URI (pode incluir o nome do banco na URI)
      // Exemplo: mongodb://mongo:27017/app_db ou mongodb://mongo:27017
      let mongoUri = this.configService.get<string>(
        'MONGODB_URI',
        'mongodb://mongo-router:27017',
      );
      
      // Extrair nome do banco da URI se estiver presente
      // Formato: mongodb://host:port/dbname
      let dbName = this.configService.get<string>('MONGO_DBNAME', 'app_db');
      
      // Se a URI contém o nome do banco, extrair
      const uriMatch = mongoUri.match(/^mongodb:\/\/[^\/]+\/(.+)$/);
      if (uriMatch) {
        dbName = uriMatch[1];
        // Remover o nome do banco da URI para usar apenas na conexão
        mongoUri = mongoUri.replace(/\/[^\/]+$/, '');
        this.logger.log(`[MongoDBService] Nome do banco extraído da URI: ${dbName}`);
      }

      this.logger.log(`[MongoDBService] Conectando ao MongoDB - uri: ${mongoUri}, dbName: ${dbName}`);
      this.logger.log(`[MongoDBService] Variáveis de ambiente - MONGODB_URI: ${this.configService.get<string>('MONGODB_URI', 'não definida')}, MONGO_DBNAME: ${this.configService.get<string>('MONGO_DBNAME', 'não definida')}`);

      this.mongoClient = new MongoClient(mongoUri);
      await this.mongoClient.connect();
      this.logger.log(`[MongoDBService] Cliente MongoDB conectado`);
      
      this.db = this.mongoClient.db(dbName);
      this.logger.log(`[MongoDBService] Database '${dbName}' selecionado`);
      
      this.messagesCollection = this.db.collection<MessageDocument>('messages');
      this.logger.log(`[MongoDBService] Coleção 'messages' obtida`);

      // Verificar se a coleção existe e contar documentos
      const collectionExists = await this.db.listCollections({ name: 'messages' }).hasNext();
      if (collectionExists) {
        const totalMessages = await this.messagesCollection.countDocuments({});
        this.logger.log(`[MongoDBService] Coleção 'messages' existe com ${totalMessages} documentos`);
      } else {
        this.logger.warn(`[MongoDBService] Coleção 'messages' não existe ainda`);
      }

      this.logger.log('[MongoDBService] Conectado ao MongoDB com sucesso');
    } catch (error) {
      this.logger.error('[MongoDBService] Erro ao conectar ao MongoDB', error);
      throw error;
    }
  }

  getMessagesCollection(): Collection<MessageDocument> {
    if (!this.messagesCollection) {
      this.logger.error('[MongoDBService] Coleção de mensagens não está disponível');
      throw new Error('Messages collection is not available');
    }
    this.logger.debug('[MongoDBService] Retornando coleção de mensagens');
    return this.messagesCollection;
  }

  /**
   * Insere um documento em uma coleção genérica
   */
  async insertOne(collectionName: string, document: any): Promise<any> {
    const collection = this.db.collection(collectionName);
    const result = await collection.insertOne(document);
    return result;
  }

  /**
   * Busca um documento em uma coleção genérica
   */
  async findOne(collectionName: string, filter: any): Promise<any> {
    const collection = this.db.collection(collectionName);
    return collection.findOne(filter);
  }

  /**
   * Busca múltiplos documentos em uma coleção genérica
   */
  async find(collectionName: string, filter: any): Promise<any[]> {
    const collection = this.db.collection(collectionName);
    return collection.find(filter).toArray();
  }

  /**
   * Deleta um documento em uma coleção genérica
   */
  async deleteOne(collectionName: string, filter: any): Promise<any> {
    const collection = this.db.collection(collectionName);
    return collection.deleteOne(filter);
  }

  /**
   * Atualiza um documento em uma coleção genérica
   */
  async updateOne(collectionName: string, filter: any, update: any): Promise<any> {
    const collection = this.db.collection(collectionName);
    return collection.updateOne(filter, { $set: update });
  }

  async onModuleDestroy() {
    try {
      if (this.mongoClient) {
        await this.mongoClient.close();
        this.logger.log('[MongoDBService] Desconectado do MongoDB');
      }
    } catch (error) {
      this.logger.error('[MongoDBService] Erro ao desconectar do MongoDB', error);
    }
  }
}

