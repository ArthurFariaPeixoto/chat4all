# Protocol Buffers - Chat4All

Esta pasta contém as definições gRPC da API do Chat4All usando Protocol Buffers (protobuf).

## Estrutura

```
proto/
└── chat4all/
    └── v1/
        ├── common.proto          # Tipos e enums comuns
        ├── auth.proto            # AuthService
        ├── conversation.proto    # ConversationService
        └── message.proto         # MessageService
```

## Serviços Definidos

### 1. AuthService (auth.proto)
- `GetToken` - Obter token de acesso
- `RefreshToken` - Renovar token expirado
- `RevokeToken` - Revogar token
- `ValidateToken` - Validar token (interno)

### 2. ConversationService (conversation.proto)
- `CreateConversation` - Criar nova conversa (privada ou grupo)
- `GetConversation` - Obter detalhes de uma conversa
- `ListConversations` - Listar conversas do usuário
- `AddMembers` - Adicionar membros a uma conversa
- `RemoveMembers` - Remover membros
- `UpdateConversation` - Atualizar metadados
- `LeaveConversation` - Sair de uma conversa
- `ArchiveConversation` - Arquivar/desarquivar
- `DeleteConversation` - Deletar conversa

### 3. MessageService (message.proto)
- `SendMessage` - Enviar mensagem
- `GetMessages` - Obter histórico de mensagens
- `StreamMessages` - Stream de mensagens em tempo real
- `GetMessageStatus` - Obter status detalhado de mensagem
- `MarkAsDelivered` - Marcar como entregue
- `MarkAsRead` - Marcar como lida
- `DeleteMessage` - Deletar mensagem
- `EditMessage` - Editar mensagem
- `SearchMessages` - Buscar mensagens

## Tipos Comuns (common.proto)

### Enums
- `ConversationType` - PRIVATE, GROUP
- `MemberRole` - MEMBER, ADMIN, OWNER
- `MessageStatus` - ACCEPTED, SENT, DELIVERED, READ, FAILED
- `MessageType` - TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, LOCATION, CONTACT
- `MessagePriority` - NORMAL, HIGH, URGENT
- `PresenceStatus` - ONLINE, AWAY, BUSY, OFFLINE
- `ConnectorStatus` - ACTIVE, INACTIVE, ERROR
- `WebhookEvent` - MESSAGE_SENT, MESSAGE_DELIVERED, etc.

## Como Usar no NestJS

Os arquivos .proto são carregados dinamicamente pelo NestJS usando `@grpc/proto-loader`:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: ['chat4all.v1'],
    protoPath: [
      join(__dirname, '../proto/chat4all/v1/common.proto'),
      join(__dirname, '../proto/chat4all/v1/auth.proto'),
      join(__dirname, '../proto/chat4all/v1/conversation.proto'),
      join(__dirname, '../proto/chat4all/v1/message.proto'),
    ],
    url: '0.0.0.0:50051',
  },
});
```

## Implementação de Controllers

```typescript
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class AuthController {
  @GrpcMethod('AuthService', 'GetToken')
  async getToken(data: GetTokenRequest): Promise<GetTokenResponse> {
    // implementação
  }
}
```

## Observações

- Todos os métodos (exceto AuthService.GetToken) requerem autenticação via metadata gRPC
- IDs são UUIDs em formato string
- Timestamps são int64 (Unix timestamp em segundos ou milissegundos)
- Metadata são sempre map<string, string>

