import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MongoDBService } from '../mongodb/mongodb.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { DeliveryCallbackDto, ReadCallbackDto } from './dto/webhook.dto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookSecrets: Map<string, string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly mongoDBService: MongoDBService,
    private readonly kafkaProducerService: KafkaProducerService,
  ) {
    // Carregar secrets dos webhooks por canal
    // Exemplo: WEBHOOK_SECRET_WHATSAPP=abc123, WEBHOOK_SECRET_INSTAGRAM=xyz789
    this.webhookSecrets = new Map();
    
    // Tentar carregar secrets de diferentes canais
    const channels = ['whatsapp', 'instagram', 'telegram', 'messenger', 'sms'];
    channels.forEach(channel => {
      const secret = this.configService.get<string>(`WEBHOOK_SECRET_${channel.toUpperCase()}`);
      if (secret) {
        this.webhookSecrets.set(channel, secret);
        this.logger.log(`[constructor] Webhook secret carregado para canal: ${channel}`);
      }
    });

    // Secret padrão para desenvolvimento
    const defaultSecret = this.configService.get<string>('WEBHOOK_SECRET_DEFAULT', 'chat4all-default-secret');
    this.webhookSecrets.set('default', defaultSecret);
  }

  /**
   * Valida a assinatura HMAC SHA256 do webhook usando o raw body
   */
  async validateSignatureRaw(
    rawBody: string,
    signature: string | undefined,
    channel: string,
  ): Promise<boolean> {
    if (!signature) {
      this.logger.warn(`[validateSignatureRaw] Assinatura ausente - channel: ${channel}`);
      
      // Em ambiente de desenvolvimento, permitir webhooks sem assinatura
      if (this.configService.get<string>('NODE_ENV') === 'development') {
        this.logger.warn('[validateSignatureRaw] Modo desenvolvimento: aceitando webhook sem assinatura');
        return true;
      }
      
      return false;
    }

    // Obter secret do canal ou usar o padrão
    const secret = this.webhookSecrets.get(channel) || this.webhookSecrets.get('default');
    
    if (!secret) {
      this.logger.error(`[validateSignatureRaw] Secret não encontrado - channel: ${channel}`);
      return false;
    }

    try {
      // Calcular HMAC SHA256 usando o raw body
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const expectedSignature = hmac.digest('hex');

      this.logger.debug(`[validateSignatureRaw] Channel: ${channel}`);
      this.logger.debug(`[validateSignatureRaw] Secret: ${secret}`);
      this.logger.debug(`[validateSignatureRaw] Raw body: ${rawBody}`);
      this.logger.debug(`[validateSignatureRaw] Signature recebida: ${signature}`);
      this.logger.debug(`[validateSignatureRaw] Signature esperada: ${expectedSignature}`);

      // Comparação segura contra timing attacks
      // Garantir que ambos os buffers tenham o mesmo tamanho
      if (signature.length !== expectedSignature.length) {
        this.logger.warn(`[validateSignatureRaw] Tamanhos diferentes - recebido: ${signature.length}, esperado: ${expectedSignature.length}`);
        return false;
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );

      if (!isValid) {
        this.logger.warn(`[validateSignatureRaw] Assinatura inválida - channel: ${channel}`);
      }

      return isValid;
    } catch (error) {
      this.logger.error(`[validateSignatureRaw] Erro ao validar assinatura - channel: ${channel}`, error.stack);
      return false;
    }
  }

  /**
   * Valida a assinatura HMAC SHA256 do webhook
   */
  async validateSignature(
    payload: any,
    signature: string | undefined,
    channel: string,
  ): Promise<boolean> {
    // Usar o método raw com JSON.stringify
    return this.validateSignatureRaw(JSON.stringify(payload), signature, channel);
  }

  /**
   * Processa callback de entrega de mensagem
   */
  async processDeliveryCallback(data: DeliveryCallbackDto, channel: string) {
    this.logger.log(`[processDeliveryCallback] Processando entrega - message_id: ${data.message_id}, recipient: ${data.recipient_id}`);

    try {
      const messagesCollection = this.mongoDBService.getMessagesCollection();

      // Atualizar status no MongoDB
      // IMPORTANTE: Incluir conversation_id na query pois é a shard key
      // Use upsert:true para criar o documento se não existir
      const updateResult = await messagesCollection.updateOne(
        { 
          message_id: data.message_id,
          conversation_id: data.conversation_id,
        },
        {
          $set: {
            status: 'DELIVERED',
            delivered_at: new Date(data.timestamp),
          },
          $addToSet: {
            delivered_to: data.recipient_id,
          },
        },
        { upsert: true },
      );

      this.logger.log(`[processDeliveryCallback] Status atualizado no MongoDB - message_id: ${data.message_id}, matched: ${updateResult.matchedCount}, upserted: ${updateResult.upsertedCount}`);

      // Publicar evento no Kafka para notificar outros serviços
      // Só publicar se houver payload válido
      try {
        await this.kafkaProducerService.publishEvent(
          'messages.delivery',
          {
            message_id: data.message_id,
            conversation_id: data.conversation_id,
            recipient_id: data.recipient_id,
            status: 'DELIVERED',
            channel: channel,
            timestamp: data.timestamp,
          },
          data.conversation_id,
        );
        this.logger.log(`[processDeliveryCallback] Evento publicado no Kafka - topic: messages.delivery, message_id: ${data.message_id}`);
      } catch (kafkaError) {
        this.logger.warn(`[processDeliveryCallback] Falha ao publicar no Kafka (não é crítico) - message_id: ${data.message_id}, erro: ${kafkaError.message}`);
        // Não propagar erro do Kafka - MongoDB foi atualizado com sucesso
      }

    } catch (error) {
      this.logger.error(`[processDeliveryCallback] Erro ao processar callback - message_id: ${data.message_id}`, error.stack);
      throw error;
    }
  }

  /**
   * Processa callback de leitura de mensagem
   */
  async processReadCallback(data: ReadCallbackDto, channel: string) {
    this.logger.log(`[processReadCallback] Processando leitura - message_id: ${data.message_id}, reader: ${data.reader_id}`);

    try {
      const messagesCollection = this.mongoDBService.getMessagesCollection();

      // Atualizar status no MongoDB
      // IMPORTANTE: Incluir conversation_id na query pois é a shard key
      // Use upsert:true para criar o documento se não existir
      const updateResult = await messagesCollection.updateOne(
        { 
          message_id: data.message_id,
          conversation_id: data.conversation_id,
        },
        {
          $set: {
            status: 'READ',
            read_at: new Date(data.timestamp),
          },
          $addToSet: {
            read_by: data.reader_id,
          },
        },
        { upsert: true },
      );

      this.logger.log(`[processReadCallback] Status atualizado no MongoDB - message_id: ${data.message_id}, matched: ${updateResult.matchedCount}, upserted: ${updateResult.upsertedCount}`);

      // Publicar evento no Kafka para notificar outros serviços
      // Só publicar se houver payload válido
      try {
        await this.kafkaProducerService.publishEvent(
          'messages.read',
          {
            message_id: data.message_id,
            conversation_id: data.conversation_id,
            reader_id: data.reader_id,
            status: 'READ',
            channel: channel,
            timestamp: data.timestamp,
          },
          data.conversation_id,
        );
        this.logger.log(`[processReadCallback] Evento publicado no Kafka - topic: messages.read, message_id: ${data.message_id}`);
      } catch (kafkaError) {
        this.logger.warn(`[processReadCallback] Falha ao publicar no Kafka (não é crítico) - message_id: ${data.message_id}, erro: ${kafkaError.message}`);
        // Não propagar erro do Kafka - MongoDB foi atualizado com sucesso
      }

    } catch (error) {
      this.logger.error(`[processReadCallback] Erro ao processar callback - message_id: ${data.message_id}`, error.stack);
      throw error;
    }
  }

  /**
   * Processa webhook genérico de canais externos
   * Adapta o formato específico do canal para o formato interno
   */
  async processGenericWebhook(webhookData: any, channel: string) {
    this.logger.log(`[processGenericWebhook] Processando webhook genérico - channel: ${channel}`);

    try {
      // Adaptar formato específico do canal
      const adaptedData = this.adaptWebhookData(webhookData, channel);

      if (!adaptedData) {
        this.logger.warn(`[processGenericWebhook] Dados do webhook não puderam ser adaptados - channel: ${channel}`);
        return;
      }

      // Determinar tipo de callback (delivery ou read)
      if (adaptedData.type === 'delivery') {
        await this.processDeliveryCallback(adaptedData.data, channel);
      } else if (adaptedData.type === 'read') {
        await this.processReadCallback(adaptedData.data, channel);
      } else {
        this.logger.warn(`[processGenericWebhook] Tipo de webhook não suportado - type: ${adaptedData.type}, channel: ${channel}`);
      }

    } catch (error) {
      this.logger.error(`[processGenericWebhook] Erro ao processar webhook - channel: ${channel}`, error.stack);
      throw error;
    }
  }

  /**
   * Adapta dados do webhook do canal para formato interno
   * TODO: Implementar adaptadores específicos para cada canal
   */
  private adaptWebhookData(webhookData: any, channel: string): { type: string; data: any } | null {
    this.logger.log(`[adaptWebhookData] Adaptando dados do webhook - channel: ${channel}`);

    // Formato genérico (já no formato esperado)
    if (webhookData.type && webhookData.message_id) {
      return {
        type: webhookData.type === 'delivered' ? 'delivery' : webhookData.type,
        data: webhookData,
      };
    }

    // Adaptar formato do WhatsApp (exemplo)
    if (channel === 'whatsapp' && webhookData.entry) {
      // TODO: Implementar adaptador específico do WhatsApp
      this.logger.warn('[adaptWebhookData] Adaptador do WhatsApp não implementado');
      return null;
    }

    // Adaptar formato do Instagram (exemplo)
    if (channel === 'instagram' && webhookData.object === 'instagram') {
      // TODO: Implementar adaptador específico do Instagram
      this.logger.warn('[adaptWebhookData] Adaptador do Instagram não implementado');
      return null;
    }

    // Adaptar formato do Telegram (exemplo)
    if (channel === 'telegram' && webhookData.update_id) {
      // TODO: Implementar adaptador específico do Telegram
      this.logger.warn('[adaptWebhookData] Adaptador do Telegram não implementado');
      return null;
    }

    this.logger.warn(`[adaptWebhookData] Formato de webhook não reconhecido - channel: ${channel}`);
    return null;
  }
}
