# Documentação dos Endpoints gRPC - Gateway API

Esta documentação descreve os serviços e métodos gRPC definidos para a Gateway API (`chat4all.v1`).

## Visão Geral

O pacote `chat4all.v1` contém os seguintes serviços principais:
1.  **AuthService**: Gerenciamento de autenticação e autorização.
2.  **ConversationService**: Gerenciamento de conversas (chats privados e grupos).
3.  **MessageService**: Envio, recebimento e gerenciamento de mensagens.

As definições estão localizadas nos arquivos `.proto` em `services/proto/chat4all/v1/`.

### Autenticação (Metadata)

Todos os métodos que requerem autenticação (a maioria dos métodos em `ConversationService` e `MessageService`) esperam que o token JWT seja enviado nos **Metadata** da chamada gRPC.

- **Key**: `Authorization`
- **Value**: `Bearer <seu_access_token>`

O servidor irá validar este token antes de processar a requisição. Caso o token seja inválido, expirado ou não fornecido, a chamada retornará um erro `UNAUTHENTICATED` (código gRPC 16).

---

## 1. AuthService

Serviço responsável pelo registro de usuários e gestão de tokens de acesso (JWT).

### Métodos

#### `RegisterUser`
Registra um novo usuário no sistema.

- **Request (`RegisterUserRequest`)**:
    - `username` (string): Nome de usuário único.
    - `email` (string, opcional): Email do usuário.
    - `password` (string): Senha do usuário.
    - `display_name` (string, opcional): Nome de exibição.
- **Response (`RegisterUserResponse`)**:
    - `user_id` (string): ID único gerado para o usuário.
    - `username` (string): Nome de usuário confirmado.
    - `email` (string, opcional): Email confirmado.
    - `display_name` (string, opcional): Nome de exibição.
    - `created_at` (int64): Timestamp de criação.

#### `GetToken`
Obtém um token de acesso (login).

- **Request (`GetTokenRequest`)**:
    - `client_id` (string): ID do cliente.
    - `client_secret` (string): Segredo do cliente.
    - `grant_type` (string): "client_credentials" ou "password".
    - `username` (string, opcional): Obrigatório para `grant_type="password"`.
    - `password` (string, opcional): Obrigatório para `grant_type="password"`.
- **Response (`GetTokenResponse`)**:
    - `access_token` (string): O token JWT.
    - `token_type` (string): Tipo do token (ex: "Bearer").
    - `expires_in` (int32): Tempo de expiração em segundos.
    - `refresh_token` (string, opcional): Token para renovação.

#### `RefreshToken`
Renova um token de acesso expirado usando um refresh token.

- **Request (`RefreshTokenRequest`)**:
    - `refresh_token` (string): O refresh token válido.
- **Response (`RefreshTokenResponse`)**:
    - `access_token` (string): Novo token de acesso.
    - `expires_in` (int32): Tempo de expiração em segundos.

#### `RevokeToken`
Revoga um token (logout ou invalidação).

- **Request (`RevokeTokenRequest`)**:
    - `token` (string): Token a ser revogado.
- **Response (`RevokeTokenResponse`)**:
    - `success` (bool): Indica se a operação foi bem-sucedida.

#### `ValidateToken`
Valida se um token é autêntico e ainda é válido (uso interno).

- **Request (`ValidateTokenRequest`)**:
    - `token` (string): Token a ser validado.
- **Response (`ValidateTokenResponse`)**:
    - `valid` (bool): Se é válido.
    - `user_id` (string, opcional): ID do usuário associado.
    - `expires_at` (int64, opcional): Timestamp de expiração.

---

## 2. ConversationService

Serviço para criar e gerenciar conversas entre usuários.

### Métodos

#### `CreateConversation`
Cria uma nova conversa (privada ou grupo).

- **Request (`CreateConversationRequest`)**:
    - `type` (`ConversationType`): `PRIVATE` ou `GROUP`.
    - `member_ids` (string[]): IDs dos participantes iniciais.
    - `name` (string, opcional): Nome do grupo (obrigatório para grupos).
    - `metadata` (map<string, string>): Metadados adicionais.
- **Response (`CreateConversationResponse`)**:
    - `conversation_id` (string): ID da conversa criada.
    - `created_at` (int64): Timestamp de criação.

#### `GetConversation`
Obtém detalhes completos de uma conversa.

- **Request (`GetConversationRequest`)**:
    - `conversation_id` (string): ID da conversa.
- **Response (`GetConversationResponse`)**:
    - `conversation` (`Conversation`): Objeto da conversa contendo membros e detalhes.

#### `ListConversations`
Lista as conversas de um usuário com paginação.

- **Request (`ListConversationsRequest`)**:
    - `user_id` (string): ID do usuário.
    - `include_archived` (bool, opcional): Incluir arquivadas?
    - `page_size` (int32, opcional): Itens por página.
    - `page_token` (string, opcional): Token para próxima página.
- **Response (`ListConversationsResponse`)**:
    - `conversations` (`Conversation`[]): Lista de conversas.
    - `next_page_token` (string, opcional): Token para a próxima página.
    - `total_count` (int32): Total de conversas.

#### `AddMembers`
Adiciona membros a um grupo.

- **Request (`AddMembersRequest`)**:
    - `conversation_id` (string): ID da conversa.
    - `user_ids` (string[]): IDs dos usuários a adicionar.
    - `role` (`MemberRole`, opcional): Papel dos novos membros.
- **Response (`AddMembersResponse`)**:
    - `added_members` (`ConversationMember`[]): Lista dos membros adicionados.

#### `RemoveMembers`
Remove membros de um grupo.

- **Request (`RemoveMembersRequest`)**:
    - `conversation_id` (string): ID da conversa.
    - `user_ids` (string[]): IDs dos usuários a remover.
- **Response (`RemoveMembersResponse`)**:
    - `success` (bool): Sucesso da operação.

#### `UpdateConversation`
Atualiza dados da conversa (nome, metadados).

- **Request (`UpdateConversationRequest`)**:
    - `conversation_id` (string): ID da conversa.
    - `name` (string, opcional): Novo nome.
    - `metadata` (map<string, string>): Novos metadados.
- **Response (`UpdateConversationResponse`)**:
    - `conversation` (`Conversation`): Conversa atualizada.

#### `LeaveConversation`
Usuário sai de uma conversa.

- **Request (`LeaveConversationRequest`)**:
    - `conversation_id` (string): ID da conversa.
    - `user_id` (string): ID do usuário saindo.
- **Response (`LeaveConversationResponse`)**:
    - `success` (bool): Sucesso.

#### `ArchiveConversation`
Arquiva ou desarquiva uma conversa.

- **Request (`ArchiveConversationRequest`)**:
    - `conversation_id` (string): ID da conversa.
    - `archived` (bool): `true` para arquivar, `false` para desarquivar.
- **Response (`ArchiveConversationResponse`)**:
    - `success` (bool): Sucesso.

#### `DeleteConversation`
Exclui permanentemente uma conversa (geralmente admin apenas).

- **Request (`DeleteConversationRequest`)**:
    - `conversation_id` (string): ID da conversa.
- **Response (`DeleteConversationResponse`)**:
    - `success` (bool): Sucesso.

---

## 3. MessageService

Serviço central de mensageria.

### Métodos

#### `SendMessage`
Envia uma mensagem para uma conversa.

- **Request (`SendMessageRequest`)**:
    - `message_id` (string): UUID para idempotência.
    - `conversation_id` (string): ID da conversa.
    - `from` (string): ID do remetente.
    - `to` (string[], opcional): Destinatários específicos.
    - `channels` (string[]): Canais de entrega (ex: "whatsapp").
    - `payload` (`MessagePayload`): Conteúdo da mensagem (texto, arquivo, localização).
    - `metadata` (map<string, string>): Metadados.
- **Response (`SendMessageResponse`)**:
    - `message_id` (string): ID da mensagem.
    - `status` (`MessageStatus`): Status inicial (ex: `SENT`).
    - `timestamp` (int64): Hora do envio.
    - `seq` (int64): Número sequencial na conversa.

#### `GetMessages`
Busca histórico de mensagens de uma conversa.

- **Request (`GetMessagesRequest`)**:
    - `conversation_id` (string): ID da conversa.
    - `since_seq` (int64, opcional): A partir do sequencial X.
    - `limit` (int32): Limite de mensagens.
    - `reverse` (bool): Ordem reversa.
- **Response (`GetMessagesResponse`)**:
    - `messages` (`Message`[]): Lista de mensagens.
    - `has_more` (bool): Se há mais mensagens.

#### `StreamMessages`
Abre um stream para receber mensagens em tempo real (Server-Side Streaming).

- **Request (`StreamMessagesRequest`)**:
    - `user_id` (string): ID do usuário ouvindo.
    - `conversation_ids` (string[]): Conversas a monitorar (vazio = todas).
- **Response (Stream de `Message`)**:
    - Retorna objetos `Message` conforme chegam em tempo real.

#### `MarkAsDelivered` / `MarkAsRead`
Atualiza status de leitura/entrega até um certo ponto (`up_to_seq`).

- **Request**: `conversation_id`, `user_id`, `up_to_seq`.
- **Response**: `success`, `updated_seq`.

#### `GetMessageStatus`
Consulta status detalhado de uma mensagem.

- **Request**: `message_id`.
- **Response**: Status global, status por canal e por destinatário.

#### `DeleteMessage` / `EditMessage`
Gerencia conteúdo de mensagens existentes.

- **Delete**: Pode apagar para todos ou só para o usuário.
- **Edit**: Altera o payload da mensagem.

#### `SearchMessages`
Busca mensagens por texto ou tipo.

- **Request**: `query`, filtros de data, tipo, conversa.
- **Response**: Lista de mensagens encontradas.

---

## Tipos Comuns (Enums)

### `ConversationType`
- `CONVERSATION_TYPE_UNSPECIFIED` (0)
- `CONVERSATION_TYPE_PRIVATE` (1)
- `CONVERSATION_TYPE_GROUP` (2)

### `MemberRole`
- `MEMBER_ROLE_UNSPECIFIED` (0)
- `MEMBER_ROLE_MEMBER` (1)
- `MEMBER_ROLE_ADMIN` (2)
- `MEMBER_ROLE_OWNER` (3)

### `MessageStatus`
- `MESSAGE_STATUS_UNSPECIFIED` (0)
- `MESSAGE_STATUS_ACCEPTED` (1)
- `MESSAGE_STATUS_SENT` (2)
- `MESSAGE_STATUS_DELIVERED` (3)
- `MESSAGE_STATUS_READ` (4)
- `MESSAGE_STATUS_FAILED` (5)

### `MessageType`
- `MESSAGE_TYPE_TEXT` (1)
- `MESSAGE_TYPE_IMAGE` (2)
- `MESSAGE_TYPE_VIDEO` (3)
- `MESSAGE_TYPE_AUDIO` (4)
- `MESSAGE_TYPE_DOCUMENT` (5)
- `MESSAGE_TYPE_LOCATION` (6)
- `MESSAGE_TYPE_CONTACT` (7)

### `PresenceStatus`
- `PRESENCE_STATUS_ONLINE` (1)
- `PRESENCE_STATUS_AWAY` (2)
- `PRESENCE_STATUS_BUSY` (3)
- `PRESENCE_STATUS_OFFLINE` (4)

