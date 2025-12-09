import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import * as path from 'path';

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'chat4all', 'v1', 'gateway.proto');
const pkgDef = loadPackageDefinition(loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gateway: any = (pkgDef as any).chat4all.v1;

const GRPC_ADDR = process.env.GRPC_ADDR || 'localhost:50051';
const channel = credentials.createInsecure();

function promisify(client: any, method: string) {
  return (req: any, meta?: any) =>
    new Promise((resolve, reject) => {
      client[method](req, meta || {}, (err: any, resp: any) => {
        if (err) return reject(err);
        resolve(resp);
      });
    });
}

async function main() {
  const authClient = new gateway.AuthService(GRPC_ADDR, channel);
  const convClient = new gateway.ConversationService(GRPC_ADDR, channel);
  const msgClient = new gateway.MessageService(GRPC_ADDR, channel);

  const auth = {
    registerUser: promisify(authClient, 'RegisterUser'),
    getToken: promisify(authClient, 'GetToken'),
  };
  const conv = {
    create: promisify(convClient, 'CreateConversation'),
    list: promisify(convClient, 'ListConversations'),
  };
  const msg = {
    send: promisify(msgClient, 'SendMessage'),
    status: promisify(msgClient, 'GetMessageStatus'),
  };

  // 1) Register two users (idempotent best effort)
  const userA = await auth.registerUser({ username: 'alice', password: 'password123' }).catch(() => null);
  const userB = await auth.registerUser({ username: 'bob', password: 'password123' }).catch(() => null);
  console.log('Users created/already existed', userA || 'alice', userB || 'bob');

  // 2) Tokens
  const { access_token: tokenA, user_id: userIdA } = await auth.getToken({ grant_type: 'password', username: 'alice', password: 'password123' }) as any;
  const { access_token: tokenB, user_id: userIdB } = await auth.getToken({ grant_type: 'password', username: 'bob', password: 'password123' }) as any;
  console.log('Tokens acquired');

  // 3) Conversation PRIVATE
  const convResp = await conv.create({ type: 'PRIVATE', member_ids: [userIdA, userIdB] }, { metadata: { authorization: `Bearer ${tokenA}` } });
  const conversationId = (convResp as any).conversation_id;
  console.log('Conversation created', conversationId);

  // 4) Send message with channels=all
  const sendResp = await msg.send({
    message_id: '',
    conversation_id: conversationId,
    channels: ['all'],
    payload: { type: 'TEXT', text: 'Hello from Alice to Bob across channels!' },
  }, { metadata: { authorization: `Bearer ${tokenA}` } });
  console.log('Message sent', sendResp);

  // 5) Wait and get status timeline
  await new Promise((r) => setTimeout(r, 1500));
  const statusResp = await msg.status({ message_id: (sendResp as any).message_id, conversation_id: conversationId }, { metadata: { authorization: `Bearer ${tokenA}` } });
  console.log('Message status timeline', JSON.stringify(statusResp, null, 2));

  // 6) List conversations as Bob
  const listResp = await conv.list({ include_archived: false, page_size: 10 }, { metadata: { authorization: `Bearer ${tokenB}` } });
  console.log('Conversations for Bob', JSON.stringify(listResp, null, 2));

  console.log('Done. For realtime, connect WS /ws and join with userId to observe events.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
