import { Injectable, Logger } from '@nestjs/common';
import {
  IMessagingProvider,
  ProviderConfig,
  MessagePayload,
  MessageResponse,
  WebhookPayload,
  ProviderStatus,
} from './interfaces';
import * as crypto from 'crypto';

@Injectable()
export class WhatsAppProvider implements IMessagingProvider {
  private logger = new Logger('WhatsAppProvider');
  private config: ProviderConfig;
  private phoneNumberId: string;
  private apiUrl: string = 'https://graph.instagram.com/v18.0';

  async init(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.phoneNumberId = config.phoneNumberId;

    if (!config.accessToken || !config.phoneNumberId) {
      throw new Error('WhatsApp provider requires accessToken and phoneNumberId');
    }

    this.logger.log('WhatsApp provider initialized');
  }

  async sendMessage(payload: MessagePayload): Promise<MessageResponse> {
    try {
      const whatsappPayload = this.buildMessagePayload(payload);

      const response = await fetch(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(whatsappPayload),
        },
      );

      const data = await response.json();

      return {
        messageId: data.messages?.[0]?.id || `wa_${Date.now()}`,
        status: 'sent',
        timestamp: new Date(),
        provider: 'whatsapp',
      };
    } catch (error) {
      this.logger.error('Failed to send message', error);
      return {
        messageId: '',
        status: 'failed',
        timestamp: new Date(),
        provider: 'whatsapp',
      };
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const response = await fetch(
        `${this.apiUrl}/${this.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      return {
        status: 'connected',
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        lastCheck: new Date(),
      };
    }
  }

  validateWebhookSignature(signature: string, payload: Buffer): boolean {
    if (!this.config.webhookSecret) {
      this.logger.warn('No webhook secret configured');
      return false;
    }

    const hash = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }

  parseWebhook(payload: any): WebhookPayload {
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const webhookData = changes?.value;

    // Message webhook
    if (webhookData?.messages) {
      const message = webhookData.messages[0];
      return {
        messageId: message.id,
        from: message.from,
        to: webhookData.metadata.phone_number_id,
        timestamp: new Date(message.timestamp * 1000),
        type: 'message',
        content: message.text?.body || message.type,
      };
    }

    // Status webhook (delivery, read)
    if (webhookData?.statuses) {
      const status = webhookData.statuses[0];
      return {
        messageId: status.id,
        from: webhookData.metadata.phone_number_id,
        to: status.recipient_id,
        timestamp: new Date(status.timestamp * 1000),
        type: 'status',
        status: status.status as any,
      };
    }

    throw new Error('Unknown webhook type');
  }

  getProviderName(): string {
    return 'whatsapp';
  }

  async disconnect(): Promise<void> {
    this.logger.log('WhatsApp provider disconnected');
  }

  /**
   * Build WhatsApp Cloud API compliant payload
   */
  private buildMessagePayload(payload: MessagePayload): any {
    const basePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: payload.to,
    };

    switch (payload.type) {
      case 'text':
        return {
          ...basePayload,
          type: 'text',
          text: { preview_url: true, body: payload.text },
        };

      case 'image':
        return {
          ...basePayload,
          type: 'image',
          image: { link: payload.media?.url },
        };

      case 'document':
        return {
          ...basePayload,
          type: 'document',
          document: {
            link: payload.media?.url,
            caption: payload.media?.caption,
          },
        };

      case 'template':
        return {
          ...basePayload,
          type: 'template',
          template: {
            name: payload.template?.name,
            language: {
              code: payload.template?.language || 'pt_BR',
            },
            parameters: payload.template?.parameters,
          },
        };

      default:
        throw new Error(`Unsupported message type: ${payload.type}`);
    }
  }
}
