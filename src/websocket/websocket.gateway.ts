import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ExecutionStatus } from '@prisma/client';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/ws',
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('WebsocketGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { jobId?: string }) {
    if (payload.jobId) {
      client.join(`job:${payload.jobId}`);
      this.logger.log(`Client ${client.id} subscribed to job: ${payload.jobId}`);
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, payload: { jobId?: string }) {
    if (payload.jobId) {
      client.leave(`job:${payload.jobId}`);
      this.logger.log(`Client ${client.id} unsubscribed from job: ${payload.jobId}`);
    }
  }

  // Cron job events
  emitCronCreated(jobId: string, jobName: string) {
    this.server.emit('cron:created', { jobId, jobName, timestamp: new Date() });
  }

  emitCronUpdated(jobId: string, jobName: string) {
    this.server.emit('cron:updated', { jobId, jobName, timestamp: new Date() });
    this.server.to(`job:${jobId}`).emit('cron:updated', {
      jobId,
      jobName,
      timestamp: new Date(),
    });
  }

  emitCronDeleted(jobId: string) {
    this.server.emit('cron:deleted', { jobId, timestamp: new Date() });
    this.server.to(`job:${jobId}`).emit('cron:deleted', {
      jobId,
      timestamp: new Date(),
    });
  }

  // Execution events
  emitExecutionStarted(jobId: string, jobName: string) {
    this.server.emit('execution:started', {
      jobId,
      jobName,
      timestamp: new Date(),
    });
    this.server.to(`job:${jobId}`).emit('execution:started', {
      jobId,
      jobName,
      timestamp: new Date(),
    });
  }

  emitExecutionCompleted(
    jobId: string,
    jobName: string,
    status: ExecutionStatus,
    errorMessage?: string,
  ) {
    const event = {
      jobId,
      jobName,
      status,
      errorMessage,
      timestamp: new Date(),
    };

    this.server.emit('execution:completed', event);
    this.server.to(`job:${jobId}`).emit('execution:completed', event);
  }

  emitExecutionFailed(jobId: string, jobName: string, errorMessage: string) {
    this.server.emit('execution:failed', {
      jobId,
      jobName,
      errorMessage,
      timestamp: new Date(),
    });
    this.server.to(`job:${jobId}`).emit('execution:failed', {
      jobId,
      jobName,
      errorMessage,
      timestamp: new Date(),
    });
  }

  // Schedule change events
  emitScheduleChanged(jobId: string, oldExpression: string, newExpression: string) {
    this.server.emit('schedule:changed', {
      jobId,
      oldExpression,
      newExpression,
      timestamp: new Date(),
    });
    this.server.to(`job:${jobId}`).emit('schedule:changed', {
      jobId,
      oldExpression,
      newExpression,
      timestamp: new Date(),
    });
  }
}

