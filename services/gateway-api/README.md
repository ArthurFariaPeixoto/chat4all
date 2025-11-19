# Gateway API - Frontend Service

Serviço de entrada da API Chat4All, responsável por receber requisições gRPC, validar e publicar eventos no Kafka.

## Estrutura

```
gateway-api/
├── src/
│   ├── auth/              # Módulo de autenticação JWT
│   ├── conversations/     # Módulo de conversas
│   ├── messages/          # Módulo de mensagens (publica no Kafka)
│   ├── kafka/             # Kafka producer
│   ├── prisma/            # Prisma client
│   └── main.ts            # Ponto de entrada
├── scripts/
│   ├── test-auth.ts       # Teste de autenticação
│   └── test-send-message.ts # Teste completo gRPC → Kafka
└── prisma/
    └── schema.prisma      # Schema do banco (CockroachDB)
```

## Funcionalidades

- ✅ Autenticação JWT (GetToken, RefreshToken, ValidateToken)
- ✅ Gestão de conversas (Create, Get, List, AddMembers)
- ✅ Envio de mensagens (publica eventos no Kafka)
- ✅ Validação de payloads e permissões
- ✅ Integração com Kafka (tópico `messages.send`)

## Como Executar

### Desenvolvimento Local

```bash
cd services/gateway-api
npm install
npx prisma generate
npm run start:dev
```

### Docker Compose

```bash
# Na raiz do projeto
docker compose up gateway-api
```

## Variáveis de Ambiente

Criar arquivo `.env` em `services/gateway-api/`:

```env
# Database
DATABASE_URL="postgresql://app_user@cockroach:26257/app_db?sslmode=disable"

# Kafka
KAFKA_BROKER="kafka:9092"
KAFKA_CLIENT_ID="gateway-api"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
JWT_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# Application
GRPC_PORT=50051
PORT=3000
```

## Testes

### Testes E2E (End-to-End)

Execute todos os testes e2e:

```bash
npm run test:e2e
```

Os testes e2e cobrem:
- ✅ Health check HTTP
- ✅ AuthService (GetToken, ValidateToken, RefreshToken, RevokeToken)
- ✅ ConversationService (Create, Get, List, AddMembers)
- ✅ MessageService (SendMessage, GetMessages)
- ✅ Fluxo completo end-to-end

Para mais detalhes, consulte [test/README.md](./test/README.md).

### Testes Unitários

```bash
npm test
```

### Scripts de Teste Manual

#### Testar Autenticação

```bash
npm run test:auth
```

#### Testar Fluxo Completo (gRPC → Kafka)

```bash
npm run test:send-message
```

Este script:
1. Obtém token de autenticação
2. Cria uma conversa
3. Envia uma mensagem
4. Verifica publicação no Kafka

Depois, acesse o Kafka UI em http://localhost:8090 para verificar o evento no tópico `messages.send`.

## Endpoints gRPC

### AuthService
- `GetToken` - Obter token de acesso
- `RefreshToken` - Renovar token
- `RevokeToken` - Revogar token
- `ValidateToken` - Validar token

### ConversationService
- `CreateConversation` - Criar conversa
- `GetConversation` - Obter detalhes
- `ListConversations` - Listar conversas
- `AddMembers` - Adicionar membros

### MessageService
- `SendMessage` - Enviar mensagem (publica no Kafka)
- `GetMessages` - Obter histórico (placeholder)

## Fluxo de Mensagens

```
Cliente → gRPC SendMessage → MessageController
  ↓
MessageService (validações)
  ↓
KafkaProducerService
  ↓
Kafka (tópico: messages.send)
  ↓
Router Worker (futuro) → Persistência
```

## Portas

- **gRPC**: 50051
- **HTTP**: 3000 (health checks)

## Health Check

```bash
curl http://localhost:3000/health
```

