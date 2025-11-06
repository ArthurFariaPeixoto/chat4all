# Scripts de Teste

Scripts para testar o Gateway API.

## Pré-requisitos

1. Serviços rodando via `docker compose up -d`
2. Gateway API rodando (`npm run start:dev` na pasta `gateway-api/`)
3. Variáveis de ambiente configuradas (`.env`)

## Scripts Disponíveis

### 1. Teste de Autenticação

Testa o AuthService (GetToken, ValidateToken, RefreshToken):

```bash
npm run test:auth
```

Ou diretamente:
```bash
ts-node scripts/test-auth.ts
```

**Variáveis de ambiente:**
- `GRPC_HOST` - Endereço do servidor gRPC (padrão: `localhost:50051`)

### 2. Teste de Publicação no Kafka

Testa se consegue publicar e consumir mensagens do Kafka:

```bash
npm run test:kafka
```

Ou diretamente:
```bash
ts-node scripts/test-kafka-publish.ts
```

**Variáveis de ambiente:**
- `KAFKA_BROKER` - Endereço do Kafka (padrão: `localhost:9093`)

## Como Usar

### Passo 1: Subir os serviços

```bash
# Na raiz do projeto
docker compose up -d
```

### Passo 2: Rodar o Gateway API

```bash
# Na pasta services/gateway-api
cd services/gateway-api
npm install
npm run start:dev
```

### Passo 3: Executar testes

Em outro terminal:

```bash
# Testar autenticação
cd services/gateway-api
npm run test:auth

# Testar Kafka
npm run test:kafka
```

## Verificar no Kafka UI

Após publicar mensagens, você pode verificar no Kafka UI:

1. Acesse: http://localhost:8090
2. Navegue até o tópico `messages.send`
3. Veja as mensagens publicadas

## Próximos Testes

Quando os módulos de Conversation e Message estiverem implementados, será criado:
- `test-send-message.ts` - Teste completo do fluxo gRPC → Kafka

