import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Kafka consumer dedicated to streaming delivery/read/send events to
 * connected websocket clients in real time.
 */
@Injectable()
export class KafkaEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaEventsService.name);
  private consumer: Consumer | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async onModuleInit() {
    const broker = this.config.get<string>('KAFKA_BROKER', 'localhost:9092');
    const clientId = this.config.get<string>('KAFKA_CLIENT_ID', 'gateway-api');
    const groupId = `${clientId}-realtime-${Math.floor(Math.random() * 10000)}`;

    const kafka = new Kafka({
      clientId,
      brokers: [broker],
      connectionTimeout: 10000,
      requestTimeout: 30000,
    });

    this.consumer = kafka.consumer({ groupId });

    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'messages.delivery', fromBeginning: false });
    await this.consumer.subscribe({ topic: 'messages.read', fromBeginning: false });
    await this.consumer.subscribe({ topic: 'messages.send', fromBeginning: false });

    this.logger.log(`[KafkaEventsService] Listening for events as group ${groupId}`);

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const payload = JSON.parse(message.value?.toString() || '{}');
          this.gateway.broadcastEvent(topic, payload);
        } catch (err) {
          this.logger.warn(`[KafkaEventsService] Failed to parse message on ${topic}: ${err.message}`);
        }
      },
    });
  }

  async onModuleDestroy() {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}
