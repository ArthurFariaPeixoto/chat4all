import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { KafkaModule } from './kafka/kafka.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

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
    // Módulos serão adicionados aqui
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

