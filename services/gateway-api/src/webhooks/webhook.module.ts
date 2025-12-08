import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { MongoDBModule } from '../mongodb/mongodb.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [MongoDBModule, KafkaModule],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
