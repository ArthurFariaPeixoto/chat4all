import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'ws';

interface JoinPayload { userId: string; }

@WebSocketGateway({
  path: '/ws',
  transports: ['websocket'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly userSockets: Map<string, Set<Socket>> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`[connect] client connected`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[disconnect] client disconnected`);
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client)) {
        sockets.delete(client);
        if (sockets.size === 0) this.userSockets.delete(userId);
        break;
      }
    }
  }

  @SubscribeMessage('join')
  handleJoin(@MessageBody() payload: JoinPayload, @ConnectedSocket() client: Socket) {
    const userId = payload?.userId;
    if (!userId) {
      this.logger.warn('[join] missing userId');
      client.send(JSON.stringify({ type: 'error', message: 'userId required' }));
      return;
    }
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client);
    client.send(JSON.stringify({ type: 'joined', userId }));
  }

  broadcastEvent(topic: string, event: any) {
    const targets: string[] = [];
    if (event?.to) targets.push(event.to);
    if (event?.user_id) targets.push(event.user_id);
    if (event?.recipient_id) targets.push(event.recipient_id);
    if (Array.isArray(event?.destinations)) {
      event.destinations.forEach((d: any) => targets.push(d.user_id));
    }
    // Always include sender so they see their own updates
    if (event?.from) targets.push(event.from);

    const payload = JSON.stringify({ topic, event });
    const uniqTargets = Array.from(new Set(targets.filter(Boolean)));

    for (const userId of uniqTargets) {
      const sockets = this.userSockets.get(userId);
      if (!sockets) continue;
      for (const socket of sockets) {
        socket.send(payload);
      }
    }
  }
}
