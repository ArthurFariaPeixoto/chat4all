# Cliente Web - Chat4All Gateway API

Cliente web simples e interativo para testar a API gRPC do Gateway através de uma interface no navegador.

## 🚀 Como Usar

### Pré-requisitos

- Node.js instalado
- **Gateway API rodando** (gRPC na porta 50051) ⚠️ **OBRIGATÓRIO**

### Passo 1: Iniciar o Gateway API

**IMPORTANTE:** O Gateway API deve estar rodando antes de usar o cliente web!

Em um terminal, execute:

```bash
cd services/gateway-api
npm install
npx prisma generate
npm run start:dev
```

Você deve ver as mensagens:
```
🚀 Gateway API gRPC server listening on port 50051
🚀 Gateway API HTTP server listening on port 3000
```

**Verificar se está rodando:**
```bash
# Testar health check
curl http://localhost:3000/health

# Verificar porta gRPC (Windows)
netstat -ano | findstr :50051

# Verificar porta gRPC (Linux/Mac)
lsof -i :50051
```

### Passo 2: Iniciar o Cliente Web

Em **outro terminal**, execute:

```bash
cd services/client-web
npm install
npm start
```

### Passo 3: Abrir no Navegador

O cliente estará disponível em: **http://localhost:8081**

## 📋 Funcionalidades

### 🔐 Autenticação

- **Obter Token**: Obter token de acesso usando `client_id` e `client_secret`
- **Validar Token**: Verificar se um token é válido
- **Renovar Token**: Renovar token usando refresh token
- **Revogar Token**: Revogar um token existente

O token obtido é armazenado automaticamente no navegador (localStorage) e usado automaticamente nas requisições que exigem autenticação.

### 💬 Conversas

- **Criar Conversa**: Criar uma nova conversa (privada ou grupo)
- **Listar Conversas**: Listar todas as conversas de um usuário
- **Obter Conversa**: Obter detalhes de uma conversa específica
- **Adicionar Membros**: Adicionar membros a uma conversa existente

### 📨 Mensagens

- **Enviar Mensagem**: Enviar uma mensagem de texto para uma conversa
- **Obter Mensagens**: Obter histórico de mensagens de uma conversa

## 🎯 Fluxo de Teste Recomendado

1. **Autenticação:**
   - Preencha `client_id` e `client_secret`
   - Clique em "Obter Token"
   - O token será armazenado automaticamente

2. **Criar Conversa:**
   - Escolha o tipo (Privada ou Grupo)
   - Informe os IDs dos membros (separados por vírgula)
   - Para grupos, opcionalmente informe o nome
   - Clique em "Criar Conversa"
   - Anote o `conversation_id` retornado

3. **Enviar Mensagem:**
   - Informe o `conversation_id` obtido anteriormente
   - Informe o `user_id` do remetente
   - Digite a mensagem
   - Clique em "Enviar Mensagem"

4. **Verificar Mensagens:**
   - Informe o `conversation_id`
   - Clique em "Obter Mensagens"
   - Veja o histórico de mensagens

## 📊 Área de Resultados

Todas as requisições e respostas são exibidas na área de resultados na parte inferior da página:

- **Sucesso** (verde): Requisições bem-sucedidas
- **Erro** (vermelho): Erros nas requisições
- **Info** (azul): Informações gerais

Você pode:
- Limpar todos os resultados
- Exportar resultados como JSON

## ⚙️ Configuração

### Variáveis de Ambiente

O servidor proxy aceita as seguintes variáveis de ambiente:

- `CLIENT_WEB_PORT`: Porta do servidor web (padrão: 8081)
- `GRPC_URL`: URL do servidor gRPC (padrão: 127.0.0.1:50051)

Exemplo:

```bash
CLIENT_WEB_PORT=8081 GRPC_URL=127.0.0.1:50051 npm start
```

## 🏗️ Arquitetura

O cliente web funciona através de um **servidor proxy** que:

1. Recebe requisições HTTP REST do navegador
2. Converte para chamadas gRPC
3. Envia para o Gateway API
4. Retorna as respostas como JSON

```
Navegador → HTTP REST → Servidor Proxy → gRPC → Gateway API
```

## 📁 Estrutura de Arquivos

```
client-web/
├── index.html      # Interface HTML
├── client.js       # Cliente JavaScript
├── styles.css      # Estilos CSS
├── server.js       # Servidor proxy Express
├── package.json    # Dependências
└── README.md       # Esta documentação
```

## 🔧 Desenvolvimento

### Modificar o Cliente

1. Edite os arquivos HTML/JS/CSS conforme necessário
2. O servidor recarrega automaticamente (se usar nodemon)
3. Recarregue a página no navegador

### Adicionar Novos Endpoints

1. Adicione o endpoint no `server.js` (proxy)
2. Adicione o formulário/handler no `index.html` e `client.js`
3. Teste a funcionalidade

## 🐛 Solução de Problemas

### Erro de Conexão

- Verifique se o Gateway API está rodando
- Verifique se a porta gRPC está correta (padrão: 50051)
- Verifique as variáveis de ambiente

### Token Inválido

- Obtenha um novo token
- Verifique se o token não expirou
- Verifique as credenciais (client_id/client_secret)

### CORS Errors

- O servidor já está configurado com CORS habilitado
- Se ainda houver problemas, verifique a configuração do Express

## 📝 Notas

- O token é armazenado no localStorage do navegador
- Os resultados são mantidos na memória (não persistem após recarregar)
- O cliente é apenas para testes, não para produção

## 🎨 Interface

A interface foi projetada para ser:
- **Responsiva**: Funciona em desktop e mobile
- **Intuitiva**: Fácil de usar e entender
- **Moderna**: Design limpo e profissional
- **Informativa**: Exibe resultados claros e detalhados

