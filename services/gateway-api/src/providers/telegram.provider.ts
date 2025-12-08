import { Injectable, Logger } from '@nestjs/common';
import {
  IMessagingProvider,
  ProviderConfig,
  MessagePayload,
  MessageResponse,
  WebhookPayload,
  ProviderStatus,
} from './interfaces';

@Injectable()
export class TelegramProvider implements IMessagingProvider {
  private logger = new Logger('TelegramProvider');
  private config: ProviderConfig;
  private botToken: string;
  private apiUrl: string = 'https://api.telegram.org';

  async init(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.botToken = config.accessToken;

    if (!config.accessToken) {
      throw new Error('Telegram provider requires accessToken (bot token)');
    }

    this.logger.log('Telegram provider initialized');
  }

  async sendMessage(payload: MessagePayload): Promise<MessageResponse> {
    try {
      const response = await fetch(
        `${this.apiUrl}/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: payload.to,
            text: payload.text,
            parse_mode: 'HTML',
          }),
        },
      );

      const data = await response.json();

      return {
        messageId: data.result?.message_id.toString(),
        status: 'sent',
        timestamp: new Date(),
        provider: 'telegram',
      };
    } catch (error) {
      this.logger.error('Failed to send message', error);
      return {
        messageId: '',
        status: 'failed',
        timestamp: new Date(),
        provider: 'telegram',
      };
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const response = await fetch(
        `${this.apiUrl}/bot${this.botToken}/getMe`,
      );

      const data = await response.json();

      return {
        status: 'connected',
        message: `Connected as ${data.result?.first_name}`,
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
    // Telegram doesn't use signatures for webhooks, it's IP-based
    // This is a placeholder for compatibility
    return true;
  }

  parseWebhook(payload: any): WebhookPayload {
    if (payload.message) {
      return {
        messageId: payload.message.message_id.toString(),
        from: payload.message.from.id.toString(),
        to: payload.message.chat.id.toString(),
        timestamp: new Date(payload.message.date * 1000),
        type: 'message',
        content: payload.message.text || `[${payload.message.type}]`,
      };
    }

    throw new Error('Unknown webhook type');
  }

  getProviderName(): string {
    return 'telegram';
  }

  async disconnect(): Promise<void> {
    this.logger.log('Telegram provider disconnected');
  }
}
