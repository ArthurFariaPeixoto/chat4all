import { Injectable } from '@nestjs/common';

@Injectable()
export class ConnectorService {
  private connectors = [
    {
      id: 'mock-1',
      name: 'WhatsApp Connector',
      type: 'whatsapp',
      status: 'active',
      config: { webhookUrl: 'https://mock.whatsapp/webhook' },
      created_at: new Date().toISOString(),
    },
    {
      id: 'mock-2',
      name: 'Telegram Connector',
      type: 'telegram',
      status: 'inactive',
      config: { webhookUrl: 'https://mock.telegram/webhook' },
      created_at: new Date().toISOString(),
    },
  ];

  uploadConnector(data: any) {
    // Mock: adiciona novo conector à lista
    const newConnector = {
      id: 'mock-' + (this.connectors.length + 1),
      name: data.name,
      type: data.type,
      status: 'active',
      config: data.config || {},
      created_at: new Date().toISOString(),
    };
    this.connectors.push(newConnector);
    return { success: true, connector: newConnector };
  }

  listConnectors() {
    return { connectors: this.connectors };
  }
}