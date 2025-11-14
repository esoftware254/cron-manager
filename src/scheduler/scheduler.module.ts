import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ExecutionService } from './execution.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  providers: [SchedulerService, ExecutionService],
  exports: [SchedulerService, ExecutionService],
})
export class SchedulerModule {}

