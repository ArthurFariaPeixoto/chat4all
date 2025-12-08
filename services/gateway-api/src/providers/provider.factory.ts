import { Injectable, BadRequestException } from '@nestjs/common';
import { IMessagingProvider, ProviderConfig } from './interfaces/provider.interface';
import { WhatsAppProvider } from './whatsapp.provider';
import { TelegramProvider } from './telegram.provider';

export type ProviderType = 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'sms';

@Injectable()
export class ProviderFactory {
  private providers = new Map<ProviderType, IMessagingProvider>();

  createProvider(type: ProviderType, config: ProviderConfig): IMessagingProvider {
    switch (type) {
      case 'whatsapp':
        return new WhatsAppProvider();
      case 'telegram':
        return new TelegramProvider();
      case 'instagram':
        // Instagram also uses WhatsApp Cloud API
        return new WhatsAppProvider();
      case 'messenger':
        throw new NotImplementedError('Messenger provider coming soon');
      case 'sms':
        throw new NotImplementedError('SMS provider coming soon');
      default:
        throw new BadRequestException(`Unsupported provider type: ${type}`);
    }
  }

  getProvider(type: ProviderType): IMessagingProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Provider ${type} not initialized`);
    }
    return provider;
  }

  registerProvider(type: ProviderType, provider: IMessagingProvider): void {
    this.providers.set(type, provider);
  }

  hasProvider(type: ProviderType): boolean {
    return this.providers.has(type);
  }
}

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
