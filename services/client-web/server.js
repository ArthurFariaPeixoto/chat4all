const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.CLIENT_WEB_PORT || 8081;
// Usar 127.0.0.1 ao invés de localhost para evitar problemas com IPv6
const GRPC_URL = process.env.GRPC_URL || '127.0.0.1:50051';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Carregar proto files
// Tenta diferentes caminhos possíveis para o diretório base dos proto
const possiblePaths = [
  path.join(__dirname, '../proto'),           // services/proto (relativo ao client-web)
  path.join(__dirname, '../../proto'),         // services/proto (alternativo)
  path.join(process.cwd(), 'services/proto'), // services/proto (a partir do workspace)
  path.join(process.cwd(), 'proto'),          // proto (se estiver na raiz)
];

let PROTO_BASE_PATH = null;
for (const testPath of possiblePaths) {
  const testV1Path = path.join(testPath, 'chat4all/v1');
  if (fs.existsSync(testV1Path)) {
    PROTO_BASE_PATH = testPath;
    break;
  }
}

if (!PROTO_BASE_PATH) {
  console.error('❌ Erro: Não foi possível encontrar os arquivos proto.');
  console.error('Caminhos testados:');
  possiblePaths.forEach(p => console.error(`  - ${p}/chat4all/v1`));
  console.error('\nPor favor, verifique se os arquivos proto estão em services/proto/chat4all/v1/');
  process.exit(1);
}

const PROTO_V1_PATH = path.join(PROTO_BASE_PATH, 'chat4all/v1');

console.log(`📁 Usando arquivos proto de: ${PROTO_V1_PATH}`);
console.log(`📁 Base path para imports: ${PROTO_BASE_PATH}`);

const packageDefinition = protoLoader.loadSync(
  [
    path.join(PROTO_V1_PATH, 'common.proto'),
    path.join(PROTO_V1_PATH, 'auth.proto'),
    path.join(PROTO_V1_PATH, 'conversation.proto'),
    path.join(PROTO_V1_PATH, 'message.proto'),
  ],
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_BASE_PATH], // Importante: base path para resolver imports como "chat4all/v1/common.proto"
  },
);

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const chat4all = protoDescriptor.chat4all.v1;

// Criar clientes gRPC
const authClient = new chat4all.AuthService(
  GRPC_URL,
  grpc.credentials.createInsecure(),
);

const conversationClient = new chat4all.ConversationService(
  GRPC_URL,
  grpc.credentials.createInsecure(),
);

const messageClient = new chat4all.MessageService(
  GRPC_URL,
  grpc.credentials.createInsecure(),
);

// Helper para fazer chamadas gRPC
function grpcCall(client, method, request, metadata = null) {
  return new Promise((resolve, reject) => {
    const call = client[method](request, metadata || {}, (error, response) => {
      if (error) {
        // Garantir que o código seja um número
        const errorCode = typeof error.code === 'number' ? error.code : parseInt(error.code) || error.code;
        
        console.error(`[grpcCall] Erro em ${method}:`, {
          code: errorCode,
          message: error.message,
          details: error.details,
          originalCode: error.code,
          codeType: typeof error.code,
        });
        
        reject({
          code: errorCode,
          message: error.message || 'Erro desconhecido',
          details: error.details,
        });
      } else {
        resolve(response);
      }
    });
  });
}

// Helper para criar metadata com token
function createMetadata(token) {
  if (!token) return null;
  const metadata = new grpc.Metadata();
  metadata.add('authorization', `Bearer ${token}`);
  return metadata;
}

// ===========================
// Auth Endpoints
// ===========================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'username e password são obrigatórios' });
    }

    const request = {
      username,
      password,
    };

    if (email) request.email = email;
    if (display_name) request.display_name = display_name;

    const response = await grpcCall(authClient, 'RegisterUser', request);

    res.json({
      user_id: response.user_id,
      username: response.username,
      email: response.email,
      display_name: response.display_name,
      created_at: response.created_at ? new Date(parseInt(response.created_at) * 1000).toISOString() : null,
    });
  } catch (error) {
    // Melhorar mensagem de erro para conexão
    if (error.code === 14 || error.message?.includes('ECONNREFUSED') || error.message?.includes('UNAVAILABLE')) {
      return res.status(503).json({ 
        error: `Não foi possível conectar ao servidor gRPC em ${GRPC_URL}`,
        code: error.code,
        details: 'Verifique se o Gateway API está rodando. Execute: cd services/gateway-api && npm run start:dev'
      });
    }
    
    // Mapear códigos de erro gRPC para HTTP
    let statusCode = 500;
    if (error.code === 3) statusCode = 400; // INVALID_ARGUMENT
    if (error.code === 6) statusCode = 409; // ALREADY_EXISTS
    if (error.code === 16) statusCode = 401; // UNAUTHENTICATED
    if (error.code === 13) statusCode = 500; // INTERNAL
    
    res.status(statusCode).json({ error: error.message, code: error.code });
  }
});

app.post('/api/auth/token', async (req, res) => {
  try {
    const { username, password, grant_type = 'password' } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'username e password são obrigatórios' });
    }

    const response = await grpcCall(authClient, 'GetToken', {
      client_id: '', // Não usado mais, mas mantido para compatibilidade
      client_secret: '', // Não usado mais, mas mantido para compatibilidade
      grant_type: 'password',
      username,
      password,
    });

    res.json({
      access_token: response.access_token,
      token_type: response.token_type,
      expires_in: response.expires_in,
      refresh_token: response.refresh_token,
    });
  } catch (error) {
    console.error('[POST /api/auth/token] Erro capturado:', {
      code: error.code,
      message: error.message,
      details: error.details,
      errorType: typeof error.code,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    
    // Converter código para número se necessário
    let errorCode = error.code;
    if (typeof errorCode !== 'number') {
      errorCode = parseInt(errorCode);
      if (isNaN(errorCode)) {
        errorCode = 13; // INTERNAL se não conseguir converter
      }
    }
    
    // Melhorar mensagem de erro para conexão
    if (errorCode === 14 || error.message?.includes('ECONNREFUSED') || error.message?.includes('UNAVAILABLE')) {
      return res.status(503).json({ 
        error: `Não foi possível conectar ao servidor gRPC em ${GRPC_URL}`,
        code: errorCode,
        details: 'Verifique se o Gateway API está rodando. Execute: cd services/gateway-api && npm run start:dev'
      });
    }
    
    // Mapear códigos de erro gRPC para HTTP
    let statusCode = 500;
    if (errorCode === 3) statusCode = 400; // INVALID_ARGUMENT
    else if (errorCode === 16) statusCode = 401; // UNAUTHENTICATED
    else if (errorCode === 13) statusCode = 500; // INTERNAL
    else if (errorCode === 6) statusCode = 409; // ALREADY_EXISTS
    
    console.log(`[POST /api/auth/token] Mapeando erro gRPC ${errorCode} para HTTP ${statusCode}`);
    
    res.status(statusCode).json({ 
      error: error.message || 'Erro ao processar requisição', 
      code: errorCode 
    });
  }
});

app.post('/api/auth/validate', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'token é obrigatório' });
    }

    const response = await grpcCall(authClient, 'ValidateToken', { token });

    res.json({
      valid: response.valid,
      user_id: response.user_id,
      expires_at: response.expires_at ? new Date(parseInt(response.expires_at) * 1000).toISOString() : null,
    });
  } catch (error) {
    // Mapear códigos de erro gRPC para HTTP
    let statusCode = 500;
    if (error.code === 3) statusCode = 400; // INVALID_ARGUMENT
    if (error.code === 16) statusCode = 401; // UNAUTHENTICATED
    if (error.code === 13) statusCode = 500; // INTERNAL
    
    res.status(statusCode).json({ error: error.message, code: error.code });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token é obrigatório' });
    }

    const response = await grpcCall(authClient, 'RefreshToken', { refresh_token });

    res.json({
      access_token: response.access_token,
      expires_in: response.expires_in,
    });
  } catch (error) {
    // Mapear códigos de erro gRPC para HTTP
    let statusCode = 500;
    if (error.code === 3) statusCode = 400; // INVALID_ARGUMENT
    if (error.code === 16) statusCode = 401; // UNAUTHENTICATED
    if (error.code === 13) statusCode = 500; // INTERNAL
    
    res.status(statusCode).json({ error: error.message, code: error.code });
  }
});

app.post('/api/auth/revoke', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'token é obrigatório' });
    }

    const response = await grpcCall(authClient, 'RevokeToken', { token });

    res.json({
      success: response.success,
    });
  } catch (error) {
    // Mapear códigos de erro gRPC para HTTP
    let statusCode = 500;
    if (error.code === 3) statusCode = 400; // INVALID_ARGUMENT
    if (error.code === 16) statusCode = 401; // UNAUTHENTICATED
    if (error.code === 13) statusCode = 500; // INTERNAL
    
    res.status(statusCode).json({ error: error.message, code: error.code });
  }
});

// ===========================
// Conversation Endpoints
// ===========================

app.post('/api/conversations/create', async (req, res) => {
  try {
    console.log('POST /api/conversations/create - Body recebido:', JSON.stringify(req.body, null, 2));
    
    const { type, member_ids, name, metadata, token } = req.body;
    
    if (!type || !member_ids || !Array.isArray(member_ids)) {
      console.error('Erro de validação: type ou member_ids inválidos');
      return res.status(400).json({ error: 'type e member_ids são obrigatórios' });
    }

    // Converter tipo para o formato esperado pelo proto
    let conversationType;
    const upperType = type.toUpperCase();
    if (upperType === 'PRIVATE') {
      conversationType = 'CONVERSATION_TYPE_PRIVATE';
    } else if (upperType === 'GROUP') {
      conversationType = 'CONVERSATION_TYPE_GROUP';
    } else {
      console.error('Erro de validação: tipo inválido:', type);
      return res.status(400).json({ error: 'type deve ser PRIVATE ou GROUP' });
    }

    const request = {
      type: conversationType,
      member_ids,
    };

    if (name) request.name = name;
    if (metadata) request.metadata = metadata;

    console.log('Chamando gRPC CreateConversation com:', JSON.stringify(request, null, 2));
    console.log('Token fornecido:', token ? 'Sim' : 'Não');

    const response = await grpcCall(
      conversationClient,
      'CreateConversation',
      request,
      createMetadata(token)
    );

    console.log('Resposta gRPC:', JSON.stringify(response, null, 2));

    res.json({
      conversation_id: response.conversation_id,
      created_at: new Date(parseInt(response.created_at) * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Erro em /api/conversations/create:', error);
    const statusCode = error.code === 16 ? 401 : error.code === 3 ? 400 : 500;
    res.status(statusCode).json({ 
      error: error.message || 'Erro ao criar conversa', 
      code: error.code 
    });
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    const response = await grpcCall(
      conversationClient,
      'GetConversation',
      { conversation_id: id },
      createMetadata(token)
    );

    res.json({
      conversation: response.conversation,
    });
  } catch (error) {
    res.status(500).json({ error: error.message, code: error.code });
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    const { include_archived, page_size, page_token, token } = req.query;

    if (!token) {
      return res.status(401).json({ error: 'Token é obrigatório' });
    }

    const request = {};
    if (include_archived !== undefined) request.include_archived = include_archived === 'true';
    if (page_size) request.page_size = parseInt(page_size);
    if (page_token) request.page_token = page_token;

    const response = await grpcCall(
      conversationClient,
      'ListConversations',
      request,
      createMetadata(token)
    );

    res.json({
      conversations: response.conversations,
      next_page_token: response.next_page_token,
      total_count: response.total_count,
    });
  } catch (error) {
    res.status(500).json({ error: error.message, code: error.code });
  }
});

app.post('/api/conversations/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_ids, role, token } = req.body;

    if (!user_ids || !Array.isArray(user_ids)) {
      return res.status(400).json({ error: 'user_ids é obrigatório e deve ser um array' });
    }

    const request = {
      conversation_id: id,
      user_ids,
    };

    if (role) request.role = role.toUpperCase();

    const response = await grpcCall(
      conversationClient,
      'AddMembers',
      request,
      createMetadata(token)
    );

    res.json({
      added_members: response.added_members,
    });
  } catch (error) {
    res.status(500).json({ error: error.message, code: error.code });
  }
});

// ===========================
// Message Endpoints
// ===========================

app.post('/api/messages/send', async (req, res) => {
  try {
    const {
      message_id,
      conversation_id,
      channels,
      payload,
      metadata,
      token,
    } = req.body;

    if (!conversation_id || !payload) {
      return res.status(400).json({ error: 'conversation_id e payload são obrigatórios' });
    }

    if (!token) {
      return res.status(401).json({ error: 'Token é obrigatório' });
    }

    // Mapear tipo de mensagem para o enum do protobuf
    const messageTypeMap = {
      'TEXT': 'MESSAGE_TYPE_TEXT',
      'IMAGE': 'MESSAGE_TYPE_IMAGE',
      'VIDEO': 'MESSAGE_TYPE_VIDEO',
      'AUDIO': 'MESSAGE_TYPE_AUDIO',
      'DOCUMENT': 'MESSAGE_TYPE_DOCUMENT',
      'LOCATION': 'MESSAGE_TYPE_LOCATION',
      'CONTACT': 'MESSAGE_TYPE_CONTACT',
    };

    // Se o tipo já está no formato do enum, usar diretamente
    // Caso contrário, mapear do formato simples para o enum
    let messageType = payload.type?.toUpperCase() || 'TEXT';
    if (!messageType.startsWith('MESSAGE_TYPE_')) {
      messageType = messageTypeMap[messageType] || 'MESSAGE_TYPE_TEXT';
    }

    const request = {
      message_id: message_id || uuidv4(),
      conversation_id,
      channels: channels || ['all'],
      payload: {
        type: messageType,
        text: payload.text,
        file: payload.file,
        location: payload.location,
        contact: payload.contact,
      },
      metadata: metadata || {},
    };

    const response = await grpcCall(
      messageClient,
      'SendMessage',
      request,
      createMetadata(token)
    );

    res.json({
      message_id: response.message_id,
      status: response.status,
      timestamp: new Date(parseInt(response.timestamp) * 1000).toISOString(),
      seq: response.seq,
    });
  } catch (error) {
    res.status(500).json({ error: error.message, code: error.code });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { conversation_id, since_seq, until_seq, limit, reverse, token } = req.query;

    console.log('[server.js] GET /api/messages - Query params:', {
      conversation_id,
      since_seq,
      until_seq,
      limit,
      reverse,
      has_token: !!token,
    });

    if (!conversation_id) {
      console.error('[server.js] GET /api/messages - conversation_id é obrigatório');
      return res.status(400).json({ error: 'conversation_id é obrigatório' });
    }

    const request = { conversation_id };
    if (since_seq) {
      request.since_seq = parseInt(since_seq);
      console.log(`[server.js] GET /api/messages - since_seq parseado: ${request.since_seq}`);
    }
    if (until_seq) {
      request.until_seq = parseInt(until_seq);
      console.log(`[server.js] GET /api/messages - until_seq parseado: ${request.until_seq}`);
    }
    if (limit) {
      request.limit = parseInt(limit);
      console.log(`[server.js] GET /api/messages - limit parseado: ${request.limit}`);
    }
    if (reverse !== undefined) {
      request.reverse = reverse === 'true';
      console.log(`[server.js] GET /api/messages - reverse parseado: ${request.reverse}`);
    }

    console.log('[server.js] GET /api/messages - Request para gRPC:', JSON.stringify(request, null, 2));

    const response = await grpcCall(
      messageClient,
      'GetMessages',
      request,
      createMetadata(token)
    );

    console.log('[server.js] GET /api/messages - Resposta do gRPC:', {
      messages_count: response.messages?.length || 0,
      has_more: response.has_more,
      next_seq: response.next_seq,
    });

    res.json({
      messages: response.messages,
      has_more: response.has_more,
      next_seq: response.next_seq,
    });
  } catch (error) {
    console.error('[server.js] GET /api/messages - Erro:', error.message, error.code);
    res.status(500).json({ error: error.message, code: error.code });
  }
});

// Servir index.html na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Cliente Web rodando em http://localhost:${PORT}`);
  console.log(`📡 Tentando conectar ao gRPC em ${GRPC_URL}`);
  console.log(`\n⚠️  IMPORTANTE: Certifique-se de que o Gateway API está rodando!`);
  console.log(`   Execute em outro terminal: cd services/gateway-api && npm run start:dev\n`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Erro: A porta ${PORT} já está em uso.`);
    console.error(`\nSoluções:`);
    console.error(`  1. Pare o processo que está usando a porta ${PORT}`);
    console.error(`  2. Use uma porta diferente: CLIENT_WEB_PORT=8081 npm start`);
    console.error(`  3. No Windows, encontre o processo: netstat -ano | findstr :${PORT}`);
    console.error(`  4. No Linux/Mac, encontre o processo: lsof -i :${PORT}`);
  } else {
    console.error(`❌ Erro ao iniciar o servidor:`, err.message);
  }
  process.exit(1);
});

