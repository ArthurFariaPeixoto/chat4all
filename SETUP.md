# Chat4All - Setup Guide

Guia de configuração inicial do projeto.

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Node.js 18+ (para desenvolvimento local)
- Git

## 🏗️ Estrutura do Projeto

O projeto é composto por três serviços principais:

1. **Gateway API** (`services/gateway-api/`) - Serviço principal gRPC (NestJS)
2. **Message Consumer** (`services/message-consumer/`) - Consumidor Kafka para processar mensagens
3. **Web Client** (`services/client-web/`) - Cliente web para testar a API

## 🚀 Setup Inicial

### 1. Clonar e Configurar Variáveis de Ambiente

```bash
# Criar arquivo .env na pasta services (usado pelo Docker)
cp services/env.example services/.env

# Editar o arquivo .env e ajustar as variáveis conforme necessário
# As principais variáveis já estão configuradas para funcionar com Docker Compose
```

**Variáveis Importantes:**
- `DATABASE_URL` - URL do CockroachDB
- `MONGODB_URI` - URI do MongoDB
- `KAFKA_BROKER` - Endereço do broker Kafka
- `JWT_SECRET` e `JWT_REFRESH_SECRET` - Chaves JWT (altere em produção!)
- `GRPC_PORT` - Porta do servidor gRPC (padrão: 50051)
- `CLIENT_WEB_PORT` - Porta do cliente web (padrão: 8081)

### 2. Subir a Infraestrutura (Docker Compose)

```bash
# Na raiz do projeto, subir todos os containers
docker compose up -d

# Ver logs em tempo real
docker compose logs -f
```

**Serviços que serão iniciados:**
- CockroachDB (porta 26257, UI: 8080)
- MongoDB (porta 27017)
- Redis (porta 6379)
- MinIO (portas 9000, 9001)
- Kafka + Zookeeper (portas 9092, 9093)
- Kafka UI (porta 8090)

### 3. Instalar Dependências dos Serviços

#### Gateway API

```bash
cd services/gateway-api
npm install

# Gerar o cliente Prisma
npx prisma generate

# Aplicar migrations (se necessário)
npx prisma migrate deploy
```

#### Message Consumer

```bash
cd services/message-consumer
npm install
```

#### Web Client

```bash
cd services/client-web
npm install
```

## 🔍 Verificar se tudo está funcionando

### Acessar Interfaces Web

- **Kafka UI**: http://localhost:8090 - Interface para visualizar tópicos e mensagens do Kafka
- **MinIO Console**: http://localhost:9001 (user: minioadmin / pass: minioadmin123) - Gerenciamento de arquivos
- **CockroachDB UI**: http://localhost:8080 - Interface web do CockroachDB
- **Gateway API Health**: http://localhost:3000/health - Health check da API
- **Web Client**: http://localhost:8081 - Cliente web para testar a API

### Verificar Containers

```bash
# Ver status de todos os containers
docker compose ps

# Ver logs de containers específicos
docker compose logs kafka
docker compose logs cockroach
docker compose logs mongo
```

### Verificar Databases

#### CockroachDB

```bash
# Entrar no container do CockroachDB
docker exec -it cockroach cockroach sql --insecure

# Executar consultas
> SHOW DATABASES;
> USE app_db;
> SHOW TABLES;
> SELECT * FROM "User" LIMIT 5;
> \q
```

#### MongoDB

```bash
# Entrar no container do MongoDB
docker exec -it mongo mongosh app_db

# Executar consultas
> show collections
> db.messages.find().limit(5)
> exit
```

### Verificar Kafka

```bash
# Listar tópicos
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

# Ver mensagens de um tópico
docker exec -it kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic messages.send --from-beginning
```

## 🛠️ Comandos Úteis

### Docker

```bash
# Parar todos os containers
docker compose down

# Parar e remover volumes (APAGA DADOS!)
docker compose down -v

# Rebuild e restart do app
docker compose up -d --build app

# Ver logs em tempo real
docker compose logs -f
```

### Gateway API (Desenvolvimento)

```bash
cd services/gateway-api

# Rodar em modo desenvolvimento (hot reload)
npm run start:dev

# Gerar cliente Prisma após mudanças no schema
npx prisma generate

# Criar nova migration após alterar schema
npx prisma migrate dev

# Aplicar migrations (production)
npx prisma migrate deploy

# Abrir Prisma Studio (visualizar dados)
npx prisma studio

# Rodar testes
npm test

# Lint e format
npm run lint
npm run format
```

### Message Consumer (Desenvolvimento)

```bash
cd services/message-consumer

# Rodar em modo desenvolvimento
npm run start:dev
# ou
npm run dev

# Compilar TypeScript
npm run build

# Rodar versão compilada
npm start
```

### Web Client (Desenvolvimento)

```bash
cd services/client-web

# Iniciar servidor
npm start

# O servidor estará disponível em http://localhost:8081
```

**Nota:** O Web Client precisa que o Gateway API esteja rodando para funcionar.

## 🔄 Fluxo de Desenvolvimento

### Desenvolvimento Local (Recomendado)

1. **Subir infraestrutura** (Docker Compose):
   ```bash
   docker compose up -d
   ```

2. **Rodar Gateway API localmente**:
   ```bash
   cd services/gateway-api
   npm install
   npx prisma generate
   npm run start:dev
   ```

3. **Rodar Message Consumer localmente** (em outro terminal):
   ```bash
   cd services/message-consumer
   npm install
   npm run start:dev
   ```

4. **Rodar Web Client** (em outro terminal):
   ```bash
   cd services/client-web
   npm install
   npm start
   ```

### Alterar Schema do Banco

1. **Alterar schema do Prisma** (`services/gateway-api/prisma/schema.prisma`)
2. **Criar migration**: 
   ```bash
   cd services/gateway-api
   npx prisma migrate dev
   ```
3. **Gerar cliente Prisma**: `npx prisma generate`

## 🐛 Troubleshooting

### Gateway API não inicia

```bash
# Verificar logs
cd services/gateway-api
npm run start:dev

# Verificar se o Prisma client foi gerado
npx prisma generate

# Verificar conexão com banco
# Testar DATABASE_URL no arquivo .env
```

### Message Consumer não conecta ao Kafka

```bash
# Verificar se o Kafka está rodando
docker compose ps kafka

# Verificar se o tópico existe
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

# Ver logs do consumer
cd services/message-consumer
npm run start:dev
```

**Nota:** O Message Consumer está configurado para `localhost:9093` (hardcoded). Certifique-se de que o Kafka está acessível nesta porta.

### Web Client não conecta ao Gateway API

1. Verificar se o Gateway API está rodando na porta 50051
2. Verificar a variável `GRPC_URL` no código ou ambiente
3. Verificar logs do servidor:
   ```bash
   cd services/client-web
   npm start
   ```

### Migration não aplicada

```bash
# Aplicar migrations manualmente
cd services/gateway-api
npx prisma migrate deploy
```

### Erro de conexão com o banco

1. Verificar se os containers estão rodando:
   ```bash
   docker compose ps
   ```

2. Verificar as variáveis de ambiente no `services/.env`
3. Aguardar o healthcheck completar (~30s para CockroachDB)
4. Testar conexão manualmente:
   ```bash
   docker exec -it cockroach cockroach sql --insecure
   ```

### Limpar tudo e recomeçar

```bash
# ATENÇÃO: Isso apaga TODOS os dados!
docker compose down -v
docker compose up -d

# Depois, reinstalar dependências e aplicar migrations
cd services/gateway-api
npm install
npx prisma generate
npx prisma migrate deploy
```

## 📚 Status da Implementação

1. ✅ Infraestrutura configurada (Docker Compose)
2. ✅ Schemas de banco definidos (Prisma + MongoDB)
3. ✅ Migrations automatizadas
4. ✅ Gateway API implementado (Auth, Conversation, Message)
5. ✅ Message Consumer implementado
6. ✅ Web Client implementado
7. ✅ Integração Kafka funcionando
8. ✅ Autenticação JWT funcionando

## 🧪 Testar a Aplicação

### 1. Iniciar todos os serviços

```bash
# Terminal 1: Infraestrutura
docker compose up -d

# Terminal 2: Gateway API
cd services/gateway-api
npm run start:dev

# Terminal 3: Message Consumer
cd services/message-consumer
npm run start:dev

# Terminal 4: Web Client
cd services/client-web
npm start
```

### 2. Acessar o Web Client

Abra http://localhost:8081 no navegador e teste:

1. **Registrar um usuário** (seção Autenticação)
2. **Fazer login** para obter token
3. **Criar uma conversa** (seção Conversas)
4. **Enviar uma mensagem** (seção Mensagens)
5. **Listar mensagens** para verificar se foram salvas

### 3. Verificar no Kafka UI

Acesse http://localhost:8090 e verifique:
- Tópico `messages.send` com mensagens
- Partições e offsets

### 4. Verificar no MongoDB

```bash
docker exec -it mongo mongosh app_db
> db.messages.find().pretty()
```

## 📖 Documentação Adicional

Para mais detalhes sobre a implementação, consulte:
- `documentacao/RESUMO_IMPLEMENTACAO.md` - Resumo completo da arquitetura e endpoints
- `services/gateway-api/README.md` - Documentação do Gateway API

## 🔗 Links Úteis

- [Prisma Docs](https://www.prisma.io/docs)
- [NestJS Docs](https://docs.nestjs.com)
- [CockroachDB Docs](https://www.cockroachlabs.com/docs)
- [Kafka Docs](https://kafka.apache.org/documentation)
- [gRPC Docs](https://grpc.io/docs/)
- [MongoDB Docs](https://www.mongodb.com/docs/)

## 📝 Notas Importantes

### Portas Utilizadas

- **3000** - Gateway API HTTP (health check)
- **50051** - Gateway API gRPC
- **8081** - Web Client
- **8080** - CockroachDB UI
- **8090** - Kafka UI
- **9000/9001** - MinIO (API/Console)
- **26257** - CockroachDB
- **27017** - MongoDB
- **6379** - Redis
- **9092/9093** - Kafka

### Variáveis de Ambiente

Todas as variáveis de ambiente estão definidas em `services/env.example`. Copie para `services/.env` e ajuste conforme necessário.

**Importante:** Em produção, altere as chaves JWT (`JWT_SECRET` e `JWT_REFRESH_SECRET`)!


