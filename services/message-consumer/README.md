# Message Consumer Service

Serviço independente que consome mensagens do Kafka e salva no MongoDB.

## Descrição

Este serviço consome mensagens do tópico `messages.send` do Kafka e persiste no MongoDB. É um serviço standalone que pode ser executado independentemente do gateway-api.

## Funcionalidades

- ✅ Consome mensagens do tópico `messages.send`
- ✅ Salva mensagens no MongoDB na coleção `messages`
- ✅ Implementa idempotência (não processa mensagens duplicadas)
- ✅ Calcula sequência (`seq`) baseada no número de mensagens na conversa
- ✅ Cria índices otimizados no MongoDB
- ✅ Tratamento de erros e logs detalhados
- ✅ Encerramento gracioso (SIGINT/SIGTERM)

## Pré-requisitos

- Node.js 18+
- Kafka rodando em `localhost:9093`
- MongoDB rodando em `localhost:27017`

## Instalação

```bash
cd services/message-consumer
npm install
```

## Uso

### Desenvolvimento

```bash
npm run start:dev
# ou
npm run dev
```

### Produção

```bash
npm run build
npm start
```

## Configuração

As configurações estão hardcoded no código:

- **Kafka**: `localhost:9093`
- **MongoDB**: `mongodb://localhost:27017/app_db`
- **Database**: `app_db`
- **Collection**: `messages`
- **Topic**: `messages.send`
- **Consumer Group**: `message-consumer-group`

## Estrutura do Documento no MongoDB

```javascript
{
  message_id: string,           // UUID da mensagem
  conversation_id: string,       // ID da conversa
  from: string,                  // ID do remetente
  to: string[],                  // IDs dos destinatários
  channels: string[],            // Canais de envio
  payload: {
    type: string,                // Tipo da mensagem (TEXT, IMAGE, etc.)
    text?: string,               // Texto (para mensagens de texto)
    file?: object,               // Referência de arquivo
    location?: object,           // Dados de localização
    contact?: object             // Dados de contato
  },
  metadata: object,              // Metadados adicionais
  timestamp: number,             // Timestamp Unix
  created_at: Date,              // Data de criação no MongoDB
  seq: number,                   // Sequência da mensagem na conversa
  status: string                 // Status (ACCEPTED, SENT, etc.)
}
```

## Índices Criados

- `message_id` (único) - Para garantir idempotência
- `conversation_id + timestamp` - Para consultas ordenadas por data
- `conversation_id + seq` - Para consultas ordenadas por sequência

## Notas

- O consumer processa mensagens de forma assíncrona
- Mensagens duplicadas são ignoradas (baseado em `message_id`)
- O `seq` é calculado automaticamente baseado no número de mensagens na conversa
- Em caso de erro, a mensagem não é commitada e será reprocessada

## Estrutura do Projeto

```
message-consumer/
├── src/
│   └── index.ts          # Código principal do consumer
├── dist/                 # Código compilado (gerado)
├── package.json
├── tsconfig.json
└── README.md
```

