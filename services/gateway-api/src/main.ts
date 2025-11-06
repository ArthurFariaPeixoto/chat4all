import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  const grpcPort = configService.get<number>('GRPC_PORT', 50051);

  // Configurar gRPC microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['chat4all.v1'],
      protoPath: [
        join(__dirname, '../../proto/chat4all/v1/common.proto'),
        join(__dirname, '../../proto/chat4all/v1/auth.proto'),
        join(__dirname, '../../proto/chat4all/v1/conversation.proto'),
        join(__dirname, '../../proto/chat4all/v1/message.proto'),
      ],
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();
  
  console.log(`🚀 Gateway API gRPC server listening on port ${grpcPort}`);
  
  await app.listen(3000);
  console.log(`🚀 Gateway API HTTP server listening on port 3000`);
}

bootstrap();

