import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderFactory, ProviderType } from './provider.factory';
import {
  IMessagingProvider,
  ProviderConfig,
  MessagePayload,
  MessageResponse,
  WebhookPayload,
} from './interfaces';

@Injectable()
export class ProviderService {
  private logger = new Logger('ProviderService');
  private providerInstances = new Map<string, IMessagingProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: ProviderFactory,
  ) {}

  /**
   * Initialize provider for a user channel
   */
  async initializeProvider(userChannelId: string): Promise<IMessagingProvider> {
    // Check if already initialized
    if (this.providerInstances.has(userChannelId)) {
      return this.providerInstances.get(userChannelId);
    }

    // Get user channel from DB
    const userChannel = await this.prisma.userChannel.findUnique({
      where: { id: userChannelId },
    });

    if (!userChannel) {
      throw new Error(`User channel ${userChannelId} not found`);
    }

    // Cast credentials safely
    const creds = userChannel.credentials as any || {};

    // Create provider instance
    const provider = this.factory.createProvider(
      userChannel.channelName as ProviderType,
      {
        accessToken: creds.accessToken,
        phoneNumberId: creds.phoneNumberId,
        businessAccountId: creds.businessAccountId,
        webhookSecret: userChannel.webhookSecret,
      },
    );

    // Initialize provider
    await provider.init({
      accessToken: creds.accessToken,
      phoneNumberId: creds.phoneNumberId,
      businessAccountId: creds.businessAccountId,
      webhookSecret: userChannel.webhookSecret,
    });

    // Cache provider instance
    this.providerInstances.set(userChannelId, provider);

    this.logger.log(
      `Provider initialized for user channel ${userChannelId} (${userChannel.channelName})`,
    );

    return provider;
  }

  /**
   * Send message through provider
   */
  async sendMessage(
    userChannelId: string,
    payload: MessagePayload,
  ): Promise<MessageResponse> {
    const provider = await this.initializeProvider(userChannelId);
    const response = await provider.sendMessage(payload);

    // Optionally save to audit log
    this.logger.log(
      `Message sent via ${provider.getProviderName()}: ${response.messageId}`,
    );

    return response;
  }

  /**
   * Get provider status
   */
  async getProviderStatus(userChannelId: string) {
    const provider = await this.initializeProvider(userChannelId);
    return provider.getStatus();
  }

  /**
   * Validate webhook signature
   */
  async validateWebhookSignature(
    userChannelId: string,
    signature: string,
    payload: Buffer,
  ): Promise<boolean> {
    const provider = await this.initializeProvider(userChannelId);
    return provider.validateWebhookSignature(signature, payload);
  }

  /**
   * Parse incoming webhook
   */
  async parseWebhook(
    userChannelId: string,
    payload: any,
  ): Promise<WebhookPayload> {
    const provider = await this.initializeProvider(userChannelId);
    return provider.parseWebhook(payload);
  }

  /**
   * Disconnect provider
   */
  async disconnectProvider(userChannelId: string): Promise<void> {
    const provider = this.providerInstances.get(userChannelId);
    if (provider) {
      await provider.disconnect();
      this.providerInstances.delete(userChannelId);
      this.logger.log(`Provider disconnected for user channel ${userChannelId}`);
    }
  }

  /**
   * Get supported providers
   */
  getSupportedProviders(): string[] {
    return ['whatsapp', 'telegram', 'instagram', 'sms', 'messenger'];
  }
}
