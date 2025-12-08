/**
 * Provider Interface - Abstraction for messaging providers
 * Defines contract that all messaging providers must implement
 */

export interface ProviderConfig {
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  webhookSecret?: string;
  apiUrl?: string;
  [key: string]: any;
}

export interface MessagePayload {
  to: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template';
  text?: string;
  media?: {
    url?: string;
    caption?: string;
  };
  template?: {
    name: string;
    language: string;
    parameters?: any[];
  };
}

export interface MessageResponse {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  timestamp: Date;
  provider: string;
}

export interface WebhookPayload {
  messageId?: string;
  from: string;
  to: string;
  timestamp: Date;
  type: 'message' | 'status' | 'delivery' | 'read';
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  content?: string;
  error?: string;
}

export interface ProviderStatus {
  status: 'connected' | 'disconnected' | 'error';
  message?: string;
  lastCheck?: Date;
}

export interface IMessagingProvider {
  /**
   * Initialize provider with configuration
   */
  init(config: ProviderConfig): Promise<void>;

  /**
   * Send message through provider
   */
  sendMessage(payload: MessagePayload): Promise<MessageResponse>;

  /**
   * Check provider connection status
   */
  getStatus(): Promise<ProviderStatus>;

  /**
   * Validate incoming webhook signature
   */
  validateWebhookSignature(signature: string, payload: Buffer): boolean;

  /**
   * Parse webhook payload
   */
  parseWebhook(payload: any): WebhookPayload;

  /**
   * Get provider name
   */
  getProviderName(): string;

  /**
   * Disconnect provider
   */
  disconnect(): Promise<void>;
}
