/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CronJobsService } from '../cron-jobs/cron-jobs.service';
import { ConfigService } from '@nestjs/config';
import { CronJob, CronJobStatus, ExecutionStatus } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';

interface ReschedulingRule {
  name: string;
  priority: number;
  condition: (job: CronJob, metrics: JobMetrics) => boolean;
  action: (job: CronJob, metrics: JobMetrics) => Promise<string | null> | string | null; // Returns new cron expression or null
}

interface JobMetrics {
  successRate: number;
  failureRate: number;
  averageExecutionTime: number;
  recentFailures: number;
  recentTimeouts: number;
  totalExecutions: number;
}

@Injectable()
export class ReschedulingService implements OnModuleInit {
  private readonly logger = new Logger(ReschedulingService.name);
  private readonly rules: ReschedulingRule[] = [];
  private enabled: boolean = false;

  constructor(
    private prisma: PrismaService,
    private cronJobsService: CronJobsService,
    private configService: ConfigService,
  ) {
    this.enabled = this.configService.get('AUTO_RESCHEDULING_ENABLED') === 'true';
    this.initializeRules();
  }

  onModuleInit() {
    if (this.enabled) {
      this.logger.log('Auto-rescheduling service enabled');
    } else {
      this.logger.log('Auto-rescheduling service disabled');
    }
  }

  private initializeRules() {
    // Rule 1: Success-based - Keep schedule if 95%+ success rate
    this.rules.push({
      name: 'success-based-keep',
      priority: 1,
      condition: (job, metrics) => metrics.successRate >= 0.95 && metrics.totalExecutions >= 20,
      action: () => null, // Keep current schedule
    });

    // Rule 2: Failure-based - Extend interval by 2x if >50% failures
    this.rules.push({
      name: 'failure-based-backoff',
      priority: 2,
      condition: (job, metrics) => metrics.failureRate > 0.5 && metrics.totalExecutions >= 10,
      action: (job, metrics) => this.extendCronInterval(job.cronExpression, 2),
    });

    // Rule 3: Timeout-based - Reduce frequency if frequent timeouts
    this.rules.push({
      name: 'timeout-based-reduce',
      priority: 3,
      condition: (job, metrics) => 
        metrics.recentTimeouts >= 3 && metrics.totalExecutions >= 10,
      action: (job, metrics) => this.extendCronInterval(job.cronExpression, 1.5),
    });

    // Rule 4: Load-based - Distribute during peak times (simple implementation)
    this.rules.push({
      name: 'load-based-distribute',
      priority: 4,
      condition: (job, metrics) => 
        metrics.averageExecutionTime > job.timeoutMs * 0.8 && metrics.totalExecutions >= 10,
      action: (job, metrics) => this.extendCronInterval(job.cronExpression, 1.2),
    });

    // Rule 5: Consecutive failures - Disable job after 3 consecutive failures
    this.rules.push({
      name: 'consecutive-failures-disable',
      priority: 5,
      condition: (job, metrics) => metrics.recentFailures >= 3,
      action: async (job, metrics) => {
        // Disable the job instead of rescheduling
        await this.disableJob(job.id);
        return null;
      },
    });

    // Sort rules by priority
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async evaluateAndReschedule() {
    if (!this.enabled) {
      return;
    }

    this.logger.log('Evaluating jobs for auto-rescheduling...');

    // Get all active jobs
    const activeJobs = await this.prisma.cronJob.findMany({
      where: { isActive: true },
    });

    for (const job of activeJobs) {
      try {
        const metrics = await this.calculateMetrics(job);
        const newExpression = await this.evaluateRules(job, metrics);

        if (newExpression && newExpression !== job.cronExpression) {
          await this.applyRescheduling(job, newExpression, 'auto-rescheduling');
          this.logger.log(
            `Auto-rescheduled job ${job.name} (${job.id}): ${job.cronExpression} -> ${newExpression}`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to evaluate job ${job.id}:`, error);
      }
    }
  }

  private async calculateMetrics(job: CronJob): Promise<JobMetrics> {
    const executions = await this.prisma.cronExecution.findMany({
      where: { cronJobId: job.id },
      orderBy: { startedAt: 'desc' },
      take: 100, // Last 100 executions for metrics
    });
    const totalExecutions = executions.length;

    if (totalExecutions === 0) {
      return {
        successRate: 1,
        failureRate: 0,
        averageExecutionTime: 0,
        recentFailures: 0,
        recentTimeouts: 0,
        totalExecutions: 0,
      };
    }

    const successful = executions.filter((e) => e.status === ExecutionStatus.SUCCESS).length;
    const failed = executions.filter((e) => e.status === ExecutionStatus.FAILED).length;
    const successRate = successful / totalExecutions;
    const failureRate = failed / totalExecutions;

    const executionTimes = executions
      .filter((e) => e.executionTimeMs)
      .map((e) => e.executionTimeMs);
    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        : 0;

    // Recent failures (last 10 executions)
    const recentExecutions = executions.slice(0, 10);
    const recentFailures = recentExecutions.filter(
      (e) => e.status === ExecutionStatus.FAILED,
    ).length;

    // Recent timeouts (executions that exceeded timeout)
    const recentTimeouts = recentExecutions.filter(
      (e) => e.executionTimeMs && e.executionTimeMs >= job.timeoutMs,
    ).length;

    return {
      successRate,
      failureRate,
      averageExecutionTime,
      recentFailures,
      recentTimeouts,
      totalExecutions,
    };
  }

  private async evaluateRules(job: CronJob, metrics: JobMetrics): Promise<string | null> {
    for (const rule of this.rules) {
      if (rule.condition(job, metrics)) {
        const actionResult = rule.action(job, metrics);
        const newExpression = actionResult instanceof Promise ? await actionResult : actionResult;
        if (newExpression) {
          this.logger.log(
            `Rule "${rule.name}" triggered for job ${job.name} (${job.id})`,
          );
          return newExpression;
        }
      }
    }
    return null;
  }

  private async applyRescheduling(
    job: CronJob,
    newExpression: string,
    reason: string,
  ): Promise<void> {
    try {
      // Update cron job
      await this.cronJobsService.update(
        job.id,
        {
          cronExpression: newExpression,
          timezone: job.timezone,
        },
        job.createdBy,
        undefined,
        undefined,
      );

      // Record schedule change with reason
      await this.prisma.scheduleChange.create({
        data: {
          cronJobId: job.id,
          oldCronExpression: job.cronExpression,
          newCronExpression: newExpression,
          reason: `Auto-rescheduling: ${reason}`,
          changedBy: job.createdBy,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to apply rescheduling for job ${job.id}:`, error);
      throw error;
    }
  }

  private extendCronInterval(cronExpression: string, factor: number): string {
    try {
      // Parse the cron expression
      const parts = cronExpression.trim().split(/\s+/);

      if (parts.length !== 5) {
        // Invalid cron expression, return original
        return cronExpression;
      }

      // Get the minutes part (first field)
      const minutes = parseInt(parts[0], 10);

      if (isNaN(minutes)) {
        // If it's a wildcard or step, try to handle it
        if (parts[0].includes('/')) {
          const [range, step] = parts[0].split('/');
          const newStep = Math.max(1, Math.floor(parseInt(step, 10) * factor));
          return `${range}/${newStep} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}`;
        }
        // Can't easily extend wildcards, return original
        return cronExpression;
      }

      // Calculate new interval
      const newMinutes = Math.max(1, Math.floor(minutes * factor));

      // Reconstruct cron expression with new minutes
      return `${newMinutes} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}`;
    } catch (error) {
      this.logger.warn(`Failed to extend cron interval: ${error}`);
      return cronExpression;
    }
  }

  private async disableJob(jobId: string): Promise<void> {
    await this.prisma.cronJob.update({
      where: { id: jobId },
      data: { isActive: false },
    });
    this.logger.warn(`Auto-disabled job ${jobId} due to consecutive failures`);
  }
}

