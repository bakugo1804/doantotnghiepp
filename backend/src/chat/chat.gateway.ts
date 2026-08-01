import { WebSocketGateway, SubscribeMessage, MessageBody, WebSocketServer, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AiService } from '../ai/ai.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway {
  @WebSocketServer() server: Server;
  constructor(private aiService: AiService) {}

  @SubscribeMessage('chat_message')
  async handleMessage(@MessageBody() data: { message: string; userId?: string }, @ConnectedSocket() client: Socket) {
    const reply = await this.aiService.chat(data.message, data.userId);
    client.emit('chat_reply', { reply, timestamp: new Date() });
  }
}
