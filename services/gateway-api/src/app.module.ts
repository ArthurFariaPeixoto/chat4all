import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { KafkaModule } from './kafka/kafka.module';
import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversations/conversation.module';
import { MessageModule } from './messages/message.module';
import { WebhookModule } from './webhooks/webhook.module';
import { HealthController } from './health.controller';
import { JwtInterceptor } from './auth/jwt-interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', '../.env', '../../.env'],
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 1000,
        limit: 150,
      },
    ]),
    KafkaModule,
    AuthModule,
    ConversationModule,
    MessageModule,
    WebhookModule,
    // Módulos serão adicionados aqui
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: JwtInterceptor,
    },
  ],
})
export class AppModule {}

