# Resumo da Implementação - Chat4All

## 📋 Índice
1. [Gateway API](#gateway-api)
2. [Message Consumer](#message-consumer)
3. [Web Client](#web-client)

---

## 🚀 Gateway API

> 📘 **Documentação Detalhada**: Para uma referência completa de todos os endpoints, mensagens e tipos gRPC, consulte [Documentação gRPC](./grpc_endpoints.md).

### Visão Geral
A Gateway API é o serviço principal da aplicação, construído com **NestJS** e expondo uma API **gRPC** na porta 50051 e um servidor HTTP na porta 3000. Ela atua como ponto de entrada para todas as operações do sistema de chat.

### Arquitetura
- **Framework**: NestJS
- **Protocolo Principal**: gRPC (porta 50051)
- **Protocolo Secundário**: HTTP REST (porta 3000) - apenas para health check
- **Banco de Dados**: 
  - **CockroachDB** (via Prisma) - para dados relacionais (usuários, conversas, membros)
  - **MongoDB** - para armazenamento de mensagens
- **Message Broker**: Kafka - para processamento assíncrono de mensagens
- **Autenticação**: JWT (access token + refresh token)

### Módulos Principais

#### 1. Auth Module (`auth/`)
Gerencia autenticação e autorização de usuários.

**Endpoints gRPC:**
- `RegisterUser` - Registra novo usuário
  - Parâmetros: `username`, `email` (opcional), `password`, `display_name` (opcional)
  - Retorna: `user_id`, `username`, `email`, `display_name`, `created_at`
  
- `GetToken` - Obtém token de acesso
  - Parâmetros: `client_id`, `client_secret`, `grant_type` (deve ser "password"), `username`, `password`
  - Retorna: `access_token`, `token_type`, `expires_in`, `refresh_token`
  
- `RefreshToken` - Renova access token
  - Parâmetros: `refresh_token`
  - Retorna: `access_token`, `expires_in`
  
- `RevokeToken` - Revoga um token
  - Parâmetros: `token`
  - Retorna: `success`
  
- `ValidateToken` - Valida um token
  - Parâmetros: `token`
  - Retorna: `valid`, `user_id`, `expires_at`

**Funcionalidades:**
- Hash de senhas com bcrypt (10 rounds)
- Validação de username (mínimo 3 caracteres)
- Validação de senha (mínimo 8 caracteres)
- Validação de formato de email
- Verificação de duplicatas (username e email únicos)
- Geração de JWT com expiração configurável
- Refresh tokens com expiração de 7 dias (configurável)

#### 2. Conversation Module (`conversations/`)
Gerencia conversas (privadas e grupos).

**Endpoints gRPC:**
- `CreateConversation` - Cria nova conversa
  - Parâmetros: `type` (PRIVATE ou GROUP), `member_ids` (array), `name` (obrigatório para GROUP), `metadata` (opcional)
  - Validações:
    - PRIVATE: exatamente 2 membros
    - GROUP: nome obrigatório, mínimo 2 membros
  - Retorna: `conversation_id`, `created_at`
  - **Autenticação**: Requerida (JWT)
  
- `GetConversation` - Obtém detalhes de uma conversa
  - Parâmetros: `conversation_id`
  - Retorna: `conversation` (com id, type, name, members, metadata, created_at, created_by, archived)
  - **Autenticação**: Requerida (JWT)
  - **Segurança**: Apenas membros da conversa podem acessar
  
- `ListConversations` - Lista conversas do usuário
  - Parâmetros: `include_archived` (boolean, padrão: false), `page_size` (número, padrão: 50), `page_token` (string, opcional)
  - Retorna: `conversations` (array), `next_page_token`, `total_count`
  - **Autenticação**: Requerida (JWT)
  - **Paginação**: Suporta paginação simples (offset-based)
  
- `AddMembers` - Adiciona membros a uma conversa
  - Parâmetros: `conversation_id`, `user_ids` (array), `role` (opcional, padrão: MEMBER)
  - Retorna: `added_members` (array com user_id, role, joined_at, last_read_seq, last_delivered_seq)
  - **Autenticação**: Requerida (JWT)
  - **Permissões**: Apenas ADMIN ou OWNER podem adicionar membros

**Funcionalidades:**
- Suporte a conversas PRIVATE (1-1) e GROUP
- Sistema de roles: OWNER, ADMIN, MEMBER
- Validação de existência de usuários
- Prevenção de duplicatas de membros
- Controle de acesso baseado em membros

#### 3. Message Module (`messages/`)
Gerencia envio e recuperação de mensagens.

**Endpoints gRPC:**
- `SendMessage` - Envia uma mensagem
  - Parâmetros:
    - `message_id` (opcional, gerado automaticamente se não fornecido)
    - `conversation_id` (obrigatório)
    - `channels` (array, padrão: ["all"])
    - `payload` (obrigatório):
      - `type` (TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, LOCATION, CONTACT)
      - `text` (para TEXT)
      - `file` (para IMAGE/VIDEO/AUDIO/DOCUMENT)
      - `location` (para LOCATION)
      - `contact` (para CONTACT)
    - `metadata` (opcional)
  - Retorna: `message_id`, `status` (ACCEPTED), `timestamp`, `seq` (0 inicialmente)
  - **Autenticação**: Requerida (JWT)
  - **Fluxo**: 
    1. Valida conversa e membro
    2. Valida payload
    3. Publica evento no Kafka (tópico: `messages.send`)
    4. Retorna resposta imediata (status ACCEPTED)
    5. Consumer processa assincronamente e salva no MongoDB
  
- `GetMessages` - Obtém mensagens de uma conversa
  - Parâmetros:
    - `conversation_id` (obrigatório)
    - `since_seq` (opcional) - busca mensagens após este seq
    - `until_seq` (opcional) - busca mensagens até este seq
    - `limit` (opcional, padrão: 50, máximo: 100)
    - `reverse` (opcional, padrão: false) - ordenação reversa
  - Retorna: `messages` (array), `has_more` (boolean), `next_seq` (número)
  - **Autenticação**: Requerida (JWT)
  - **Fonte de Dados**: MongoDB
  - **Ordenação**: Por `seq` (crescente ou decrescente)

**Funcionalidades:**
- Suporte a múltiplos tipos de mensagem
- Validação de payload por tipo
- Processamento assíncrono via Kafka
- Busca paginada com filtros de sequência
- Ordenação configurável (crescente/decrescente)

#### 4. Health Controller (`health.controller.ts`)
Endpoint HTTP para verificação de saúde do serviço.

**Endpoint HTTP:**
- `GET /health` - Retorna status do serviço
  - Retorna: `{ status: "ok", service: "gateway-api", timestamp: ISO string }`

### Segurança

#### JWT Authentication
- **Guard**: `JwtAuthGuard` - protege endpoints gRPC
- **Strategy**: `JwtStrategy` - valida tokens JWT
- **Interceptor**: `JwtInterceptor` - extrai token do metadata gRPC
- **Formato do Token**: Bearer token no header `authorization`

#### Rate Limiting
- Configurado via `ThrottlerModule`
- Limite: 150 requisições por segundo (ttl: 1000ms)

### Integrações

#### Kafka Producer (`kafka/kafka-producer.service.ts`)
- **Tópico**: `messages.send`
- **Particionamento**: Por `conversation_id` (hash) - garante ordem por conversa
- **Número de Partições**: 3 (configurável)
- **Headers**: `message-id`, `conversation-id`, `from`, `timestamp`

#### MongoDB Service (`mongodb/mongodb.service.ts`)
- **Database**: `app_db`
- **Collection**: `messages`
- **Índices**:
  - `message_id` (único)
  - `conversation_id` + `timestamp` (descendente)
  - `conversation_id` + `seq`

#### Prisma Service (`prisma/prisma.service.ts`)
- **ORM**: Prisma
- **Database**: CockroachDB
- **Modelos Principais**:
  - `User` - usuários do sistema
  - `Conversation` - conversas
  - `ConversationMember` - membros de conversas

### Configuração

**Variáveis de Ambiente Principais:**
- `GRPC_PORT` - Porta do servidor gRPC (padrão: 50051)
- `JWT_SECRET` - Chave secreta para JWT
- `JWT_EXPIRATION` - Expiração do access token (padrão: "15m")
- `JWT_REFRESH_SECRET` - Chave secreta para refresh token
- `JWT_REFRESH_EXPIRATION` - Expiração do refresh token (padrão: "7d")
- `KAFKA_BROKER` - Endereço do broker Kafka (padrão: "kafka:9092")
- `KAFKA_CLIENT_ID` - ID do cliente Kafka (padrão: "gateway-api")
- `DATABASE_URL` - URL de conexão do CockroachDB
- `MONGODB_URI` - URI de conexão do MongoDB

---

## 📨 Message Consumer

### Visão Geral
Serviço auxiliar que consome mensagens do Kafka e as persiste no MongoDB. Implementado em TypeScript puro (sem framework).

### Arquitetura
- **Linguagem**: TypeScript
- **Message Broker**: Kafka (tópico: `messages.send`)
- **Banco de Dados**: MongoDB
- **Configuração**: Hardcoded para localhost (desenvolvimento)

### Funcionalidades

#### 1. Conexão com Kafka
- **Broker**: `localhost:9093` (hardcoded)
- **Client ID**: `message-consumer`
- **Group ID**: `message-consumer-group`
- **Tópico**: `messages.send`
- **Configurações**:
  - Connection timeout: 3000ms
  - Request timeout: 30000ms
  - Retry: 5 tentativas com backoff exponencial

#### 2. Conexão com MongoDB
- **URI**: `mongodb://localhost:27017/app_db` (hardcoded)
- **Database**: `app_db`
- **Collection**: `messages`

#### 3. Processamento de Mensagens

**Fluxo:**
1. Consome mensagens do tópico `messages.send`
2. Verifica idempotência (evita processar mensagens duplicadas)
3. Calcula `seq` baseado no número de mensagens na conversa
4. Cria documento MongoDB com:
   - `message_id` (único)
   - `conversation_id`
   - `from` (remetente)
   - `to` (destinatários - calculado pelo worker)
   - `channels` (canais de envio)
   - `payload` (conteúdo da mensagem)
   - `metadata`
   - `timestamp`
   - `created_at` (Date)
   - `seq` (sequência na conversa)
   - `status` (inicial: "ACCEPTED")
5. Salva no MongoDB

**Idempotência:**
- Verifica se `message_id` já existe antes de processar
- Evita duplicação de mensagens

**Índices Criados:**
- `message_id` (único) - para idempotência
- `conversation_id` + `timestamp` (descendente) - para queries eficientes
- `conversation_id` + `seq` - para ordenação por sequência

### Tratamento de Erros
- Erros são logados mas não interrompem o processamento
- Mensagens com erro são ignoradas (em produção, enviar para DLQ)

### Encerramento Gracioso
- Handlers para `SIGINT` e `SIGTERM`
- Desconecta do Kafka e MongoDB antes de encerrar

### Scripts
- `npm run build` - Compila TypeScript
- `npm run start` - Executa versão compilada
- `npm run start:dev` / `npm run dev` - Executa com ts-node

---

## 🌐 Web Client

### Visão Geral
Cliente web para testar a API gRPC. Implementado como servidor Express que expõe endpoints HTTP REST e converte para chamadas gRPC.

### Arquitetura
- **Framework**: Express.js
- **Protocolo Cliente**: HTTP REST
- **Protocolo Backend**: gRPC (converte REST → gRPC)
- **Frontend**: HTML + JavaScript vanilla
- **Porta**: 8081 (configurável via `CLIENT_WEB_PORT`)

### Endpoints HTTP REST

#### Autenticação (`/api/auth/*`)

**POST `/api/auth/register`**
- Registra novo usuário
- Body: `{ username, email?, password, display_name? }`
- Retorna: `{ user_id, username, email, display_name, created_at }`

**POST `/api/auth/token`**
- Obtém token de acesso
- Body: `{ username, password, grant_type? }`
- Retorna: `{ access_token, token_type, expires_in, refresh_token }`
- Armazena token no localStorage

**POST `/api/auth/validate`**
- Valida um token
- Body: `{ token }`
- Retorna: `{ valid, user_id, expires_at }`

**POST `/api/auth/refresh`**
- Renova access token
- Body: `{ refresh_token }`
- Retorna: `{ access_token, expires_in }`

**POST `/api/auth/revoke`**
- Revoga um token
- Body: `{ token }`
- Retorna: `{ success }`

#### Conversas (`/api/conversations/*`)

**POST `/api/conversations/create`**
- Cria nova conversa
- Body: `{ type, member_ids, name?, metadata?, token }`
- Retorna: `{ conversation_id, created_at }`

**GET `/api/conversations/:id`**
- Obtém detalhes de uma conversa
- Query: `?token=...`
- Retorna: `{ conversation }`

**GET `/api/conversations`**
- Lista conversas do usuário
- Query: `?include_archived=true|false&page_size=50&page_token=...&token=...`
- Retorna: `{ conversations, next_page_token, total_count }`

**POST `/api/conversations/:id/members`**
- Adiciona membros a uma conversa
- Body: `{ user_ids, role?, token }`
- Retorna: `{ added_members }`

#### Mensagens (`/api/messages/*`)

**POST `/api/messages/send`**
- Envia uma mensagem
- Body: `{ message_id?, conversation_id, channels?, payload, metadata?, token }`
- Retorna: `{ message_id, status, timestamp, seq }`

**GET `/api/messages`**
- Obtém mensagens de uma conversa
- Query: `?conversation_id=...&since_seq=...&until_seq=...&limit=...&reverse=true|false&token=...`
- Retorna: `{ messages, has_more, next_seq }`

### Frontend (`client.js`)

**Funcionalidades:**
- Interface HTML para testar todos os endpoints
- Gerenciamento de token (armazenamento no localStorage)
- Exibição de resultados em tempo real
- Formatação de mensagens por tipo
- Exportação de resultados para JSON
- Limpeza de resultados

**Seções da Interface:**
1. **Autenticação**
   - Registro de usuário
   - Login (obtenção de token)
   - Validação de token
   - Renovação de token
   - Revogação de token

2. **Conversas**
   - Criar conversa
   - Listar conversas
   - Obter conversa
   - Adicionar membros

3. **Mensagens**
   - Enviar mensagem
   - Obter mensagens

**Gerenciamento de Token:**
- Token armazenado no `localStorage` como `chat4all_token`
- Refresh token armazenado como `chat4all_refresh_token`
- Token enviado automaticamente em requisições autenticadas
- Exibição do token atual (primeiros 30 caracteres)

**Tratamento de Erros:**
- Mapeamento de códigos de erro gRPC para mensagens legíveis
- Exibição de erros com código e descrição
- Tratamento especial para erros de conexão

### Conversão gRPC → HTTP

**Helper Functions:**
- `grpcCall(client, method, request, metadata)` - Faz chamada gRPC e retorna Promise
- `createMetadata(token)` - Cria metadata gRPC com token de autorização

**Mapeamento de Erros:**
- Código gRPC 3 (INVALID_ARGUMENT) → HTTP 400
- Código gRPC 6 (ALREADY_EXISTS) → HTTP 409
- Código gRPC 13 (INTERNAL) → HTTP 500
- Código gRPC 14 (UNAVAILABLE) → HTTP 503
- Código gRPC 16 (UNAUTHENTICATED) → HTTP 401

### Configuração

**Variáveis de Ambiente:**
- `CLIENT_WEB_PORT` - Porta do servidor (padrão: 8081)
- `GRPC_URL` - Endereço do servidor gRPC (padrão: "127.0.0.1:50051")

**Caminhos de Proto:**
O servidor tenta encontrar os arquivos `.proto` em múltiplos caminhos:
1. `../proto` (relativo ao client-web)
2. `../../proto` (alternativo)
3. `services/proto` (a partir do workspace)
4. `proto` (se estiver na raiz)

### Scripts
- `npm start` - Inicia o servidor

---

## 🔄 Fluxo de Mensagens

### Envio de Mensagem

1. **Cliente** → **Gateway API** (gRPC `SendMessage`)
   - Validação de conversa e membro
   - Validação de payload

2. **Gateway API** → **Kafka** (tópico `messages.send`)
   - Publica evento com dados da mensagem
   - Retorna resposta imediata (status ACCEPTED)

3. **Kafka** → **Message Consumer**
   - Consome evento do tópico
   - Verifica idempotência
   - Calcula seq
   - Salva no MongoDB

4. **Cliente** → **Gateway API** (gRPC `GetMessages`)
   - Busca mensagens do MongoDB
   - Retorna mensagens com seq, status, etc.

### Fluxo de Autenticação

1. **Cliente** → **Gateway API** (gRPC `GetToken`)
   - Valida credenciais
   - Gera JWT (access + refresh)

2. **Cliente** → **Gateway API** (chamadas subsequentes)
   - Inclui token no metadata gRPC
   - `JwtAuthGuard` valida token
   - Extrai `userId` do token

---

## 📊 Resumo de Endpoints

### Gateway API (gRPC)

| Serviço | Método | Autenticação | Descrição |
|---------|--------|--------------|-----------|
| AuthService | RegisterUser | ❌ | Registra novo usuário |
| AuthService | GetToken | ❌ | Obtém token de acesso |
| AuthService | RefreshToken | ❌ | Renova access token |
| AuthService | RevokeToken | ❌ | Revoga token |
| AuthService | ValidateToken | ❌ | Valida token |
| ConversationService | CreateConversation | ✅ | Cria conversa |
| ConversationService | GetConversation | ✅ | Obtém conversa |
| ConversationService | ListConversations | ✅ | Lista conversas |
| ConversationService | AddMembers | ✅ | Adiciona membros |
| MessageService | SendMessage | ✅ | Envia mensagem |
| MessageService | GetMessages | ✅ | Obtém mensagens |

### Web Client (HTTP REST)

| Método | Endpoint | Autenticação | Descrição |
|--------|----------|--------------|-----------|
| POST | `/api/auth/register` | ❌ | Registra usuário |
| POST | `/api/auth/token` | ❌ | Obtém token |
| POST | `/api/auth/validate` | ❌ | Valida token |
| POST | `/api/auth/refresh` | ❌ | Renova token |
| POST | `/api/auth/revoke` | ❌ | Revoga token |
| POST | `/api/conversations/create` | ✅ | Cria conversa |
| GET | `/api/conversations/:id` | ✅ | Obtém conversa |
| GET | `/api/conversations` | ✅ | Lista conversas |
| POST | `/api/conversations/:id/members` | ✅ | Adiciona membros |
| POST | `/api/messages/send` | ✅ | Envia mensagem |
| GET | `/api/messages` | ✅ | Obtém mensagens |

---

## 🛠️ Tecnologias Utilizadas

### Gateway API
- NestJS (framework)
- gRPC (protocolo)
- Prisma (ORM)
- CockroachDB (banco relacional)
- MongoDB (banco de mensagens)
- Kafka (message broker)
- JWT (autenticação)
- bcrypt (hash de senhas)

### Message Consumer
- TypeScript
- KafkaJS (cliente Kafka)
- MongoDB Driver (cliente MongoDB)

### Web Client
- Express.js (servidor)
- gRPC-js (cliente gRPC)
- HTML/CSS/JavaScript (frontend)

---

## 📝 Notas Importantes

1. **Idempotência**: O sistema garante que mensagens com o mesmo `message_id` não sejam processadas duas vezes.

2. **Ordenação**: Mensagens são ordenadas por `seq` (sequência) dentro de cada conversa, garantindo ordem de chegada.

3. **Particionamento Kafka**: Mensagens são particionadas por `conversation_id`, garantindo ordem dentro de cada conversa.

4. **Segurança**: Todos os endpoints de conversas e mensagens requerem autenticação JWT.

5. **Validação**: Validações extensivas em todos os níveis (payload, membros, permissões).

6. **Logging**: Sistema extensivo de logging em todos os serviços para debugging.

7. **Configuração**: Variáveis de ambiente para flexibilidade em diferentes ambientes.

