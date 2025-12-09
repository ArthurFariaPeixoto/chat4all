import { Logger } from '@nestjs/common';

export interface ChannelAdapter {
  connect(): Promise<void>;
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
  webhookHandler?(raw: any): Promise<any>;
}

export interface ChannelAdapterInfo {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive';
  created_at: string;
  config?: Record<string, any>;
  adapter: ChannelAdapter;
}

/**
 * Factory that provides built-in mock adapters. The mock adapters simulate
 * delivery and allow the platform to be exercised without external APIs.
 */
export class ChannelAdapterFactory {
  private static baseAdapter(type: string): ChannelAdapter {
    const logger = new Logger(`${type}-adapter`);
    return {
      async connect() {
        logger.log(`[connect] Connected mock ${type} adapter`);
      },
      async sendMessage(payload) {
        logger.log(`[sendMessage] type=${type} to=${payload.to} msg=${payload.messageId}`);
        // Simulate fast delivery
        return { status: 'DELIVERED', deliveredAt: Date.now() };
      },
      async sendFile(payload) {
        logger.log(`[sendFile] type=${type} to=${payload.to} file=${payload.fileUrl}`);
        return { status: 'DELIVERED', deliveredAt: Date.now() };
      },
      async webhookHandler(raw) {
        logger.debug(`[webhook] type=${type} payload=${JSON.stringify(raw)}`);
        return raw;
      },
    };
  }

  static whatsapp(): ChannelAdapterInfo {
    return {
      id: 'builtin-whatsapp',
      name: 'WhatsApp (mock)',
      type: 'whatsapp',
      status: 'active',
      created_at: new Date().toISOString(),
      config: {},
      adapter: this.baseAdapter('whatsapp'),
    };
  }

  static instagram(): ChannelAdapterInfo {
    return {
      id: 'builtin-instagram',
      name: 'Instagram (mock)',
      type: 'instagram',
      status: 'active',
      created_at: new Date().toISOString(),
      config: {},
      adapter: this.baseAdapter('instagram'),
    };
  }

  static telegram(): ChannelAdapterInfo {
    return {
      id: 'builtin-telegram',
      name: 'Telegram (mock)',
      type: 'telegram',
      status: 'active',
      created_at: new Date().toISOString(),
      config: {},
      adapter: this.baseAdapter('telegram'),
    };
  }

  /**
   * Creates an adapter descriptor from user input (metadata-only) and reuses
   * the mock adapter implementation to keep the flow working without external
   * dependencies.
   */
  static fromDescriptor(data: Partial<ChannelAdapterInfo>): ChannelAdapterInfo {
    const type = (data.type || 'custom').toLowerCase();
    return {
      id: data.id || `custom-${type}-${Date.now()}`,
      name: data.name || `Custom ${type}`,
      type,
      status: (data.status as any) || 'active',
      created_at: data.created_at || new Date().toISOString(),
      config: data.config || {},
      adapter: this.baseAdapter(type),
    };
  }
}
