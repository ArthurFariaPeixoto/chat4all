import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, ChannelAdapterFactory, ChannelAdapterInfo } from './channel.adapter';

/**
 * Registry/manager for channel adapters (plugins). This keeps a lightweight
 * in-memory catalog and delegates message/file sends to the concrete adapter.
 */
@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);
  private readonly registry: Map<string, ChannelAdapterInfo> = new Map();

  constructor() {
    // Bootstrap built-in mock adapters so the system works out-of-the-box.
    this.registerAdapter(ChannelAdapterFactory.whatsapp());
    this.registerAdapter(ChannelAdapterFactory.instagram());
    this.registerAdapter(ChannelAdapterFactory.telegram());
  }

  /**
   * Registers a new adapter (plugin) at runtime.
   */
  registerAdapter(info: ChannelAdapterInfo): void {
    const key = info.type.toLowerCase();
    this.logger.log(`[registerAdapter] Registering adapter type=${info.type}, name=${info.name}`);
    this.registry.set(key, info);
  }

  /** Lists all adapters (built-in + dynamically registered). */
  listConnectors(): { connectors: ChannelAdapterInfo[] } {
    return { connectors: Array.from(this.registry.values()) };
  }

  /**
   * Upload/register a connector provided by the user (metadata-only). For
   * simplicity we keep the mock adapter implementation but persist the
   * descriptor so the router-worker can select it.
   */
  uploadConnector(data: Partial<ChannelAdapterInfo>) {
    const adapter = ChannelAdapterFactory.fromDescriptor(data);
    this.registerAdapter(adapter);
    return { success: true, connector: adapter };
  }

  /**
   * Returns an adapter implementation for a given channel type.
   */
  getAdapter(channel: string): ChannelAdapter | null {
    const info = this.registry.get(channel.toLowerCase());
    if (!info) return null;
    return info.adapter;
  }
}