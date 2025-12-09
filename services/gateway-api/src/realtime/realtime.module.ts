import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { KafkaEventsService } from './kafka-events.service';

@Module({
  imports: [ConfigModule],
  providers: [RealtimeGateway, KafkaEventsService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
