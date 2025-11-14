import { Module } from '@nestjs/common';
import { ReschedulingService } from './rescheduling.service';
import { CronJobsModule } from '../cron-jobs/cron-jobs.module';

@Module({
  imports: [CronJobsModule],
  providers: [ReschedulingService],
  exports: [ReschedulingService],
})
export class ReschedulingModule {}

