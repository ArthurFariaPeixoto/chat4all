import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  const grpcPort = configService.get<number>('GRPC_PORT', 50051);

  // Usar caminho absoluto baseado no diretório de trabalho
  // No Docker: /usr/src/app, localmente: raiz do projeto
  const protoBasePath = join(process.cwd(), 'proto');

  // Configurar gRPC microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['chat4all.v1'],
      protoPath: [
        join(protoBasePath, 'chat4all/v1/common.proto'),
        join(protoBasePath, 'chat4all/v1/auth.proto'),
        join(protoBasePath, 'chat4all/v1/conversation.proto'),
        join(protoBasePath, 'chat4all/v1/message.proto'),
      ],
      loader: {
        includeDirs: [protoBasePath],
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();
  
  console.log(`🚀 Gateway API gRPC server listening on port ${grpcPort}`);
  
  await app.listen(3000);
  console.log(`🚀 Gateway API HTTP server listening on port 3000`);
}

bootstrap();

