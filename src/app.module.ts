import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CronJobsModule } from './cron-jobs/cron-jobs.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AuditModule } from './audit/audit.module';
import { WebsocketModule } from './websocket/websocket.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ReschedulingModule } from './rescheduling/rescheduling.module';
import { AppController } from './app.controller';
import { ViewsController } from './views/views.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CronJobsModule,
    SchedulerModule,
    AuditModule,
    WebsocketModule,
    MonitoringModule,
    ReschedulingModule,
  ],
  controllers: [AppController, ViewsController],
})
export class AppModule {}

