import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionService } from './execution.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CronJob as PrismaCronJob, CronJobStatus, ExecutionStatus } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';
import { CronJob } from 'cron';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly registeredJobs = new Map<string, CronJob>();

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private prisma: PrismaService,
    private executionService: ExecutionService,
    private websocketGateway: WebsocketGateway,
  ) {}

  async onModuleInit() {
    // Load all active cron jobs from database
    const activeJobs = await this.prisma.cronJob.findMany({
      where: { isActive: true },
    });

    for (const job of activeJobs) {
      await this.registerJob(job);
    }

    this.logger.log(`Loaded ${activeJobs.length} active cron jobs`);
  }

  async onModuleDestroy() {
    // Unregister all jobs on shutdown
    for (const jobId of this.registeredJobs.keys()) {
      this.unregisterJob(jobId);
    }
  }

  async registerJob(prismaJob: PrismaCronJob): Promise<void> {
    // Remove existing job if any
    if (this.registeredJobs.has(prismaJob.id)) {
      this.unregisterJob(prismaJob.id);
    }

    try {
      // Create cron job
      const cronJob = new CronJob(prismaJob.cronExpression, async () => {
        await this.executeJob(prismaJob);
      }, null, false, prismaJob.timezone);

      // Start the job
      cronJob.start();

      // Store in registry and map
      this.schedulerRegistry.addCronJob(prismaJob.id, cronJob as any);
      this.registeredJobs.set(prismaJob.id, cronJob);

      this.logger.log(`Registered cron job: ${prismaJob.name} (${prismaJob.id})`);
    } catch (error) {
      this.logger.error(`Failed to register cron job ${prismaJob.id}:`, error);
      throw error;
    }
  }

  async unregisterJob(jobId: string): Promise<void> {
    try {
      if (this.registeredJobs.has(jobId)) {
        const cronJob = this.registeredJobs.get(jobId);
        cronJob.stop();
        this.schedulerRegistry.deleteCronJob(jobId);
        this.registeredJobs.delete(jobId);
        this.logger.log(`Unregistered cron job: ${jobId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to unregister cron job ${jobId}:`, error);
    }
  }

  async executeJob(prismaJob: PrismaCronJob, isManual: boolean = false): Promise<any> {
    const startTime = Date.now();

    // Update job status
    await this.prisma.cronJob.update({
      where: { id: prismaJob.id },
      data: {
        status: CronJobStatus.RUNNING,
        lastRunAt: new Date(),
      },
    });

    // Emit WebSocket event
    this.websocketGateway.emitExecutionStarted(prismaJob.id, prismaJob.name);

    try {
      // Create execution record
      const execution = await this.prisma.cronExecution.create({
        data: {
          cronJobId: prismaJob.id,
          startedAt: new Date(),
          status: ExecutionStatus.RUNNING,
          attemptNumber: 1,
        },
      });

      // Execute the job with retry logic
      let attempt = 1;
      let lastError: any = null;

      while (attempt <= prismaJob.retryCount) {
        try {
          const result = await this.executionService.executeHttpRequest(
            prismaJob.endpointUrl,
            prismaJob.httpMethod,
            prismaJob.headers as Record<string, string> || {},
            prismaJob.body,
            prismaJob.queryParams as Record<string, string> || {},
            prismaJob.timeoutMs,
          );

          const executionTime = Date.now() - startTime;

          // Check if response is HTML before saving
          let responseBodyToSave: string | null = null;
          let responseDataStr: string;

          if (typeof result.data === 'string') {
            responseDataStr = result.data;
          } else if (result.data === null || result.data === undefined) {
            responseDataStr = '';
          } else {
            try {
              responseDataStr = JSON.stringify(result.data);
            } catch {
              responseDataStr = String(result.data);
            }
          }

          const trimmed = responseDataStr.trim();

          // Check for HTML patterns
          const isHtml =
            trimmed.startsWith('<!DOCTYPE') ||
            trimmed.startsWith('<!doctype') ||
            trimmed.startsWith('<!Doctype') ||
            trimmed.startsWith('<html') ||
            trimmed.startsWith('<HTML') ||
            trimmed.startsWith('<Html') ||
            (trimmed.startsWith('<') && (trimmed.includes('</html>') || trimmed.includes('</HTML>'))) ||
            (trimmed.includes('<!DOCTYPE') && trimmed.includes('<html'));

          if (isHtml) {
            this.logger.warn(
              `Cron job ${prismaJob.name} (${prismaJob.id}) returned HTML instead of JSON. Response body not saved.`,
            );
            responseBodyToSave = null;
          } else {
            // Save as JSON string
            responseBodyToSave = JSON.stringify(result.data);
          }

          // Update execution record
          await this.prisma.cronExecution.update({
            where: { id: execution.id },
            data: {
              completedAt: new Date(),
              status: ExecutionStatus.SUCCESS,
              responseStatus: result.status,
              responseBody: responseBodyToSave,
              executionTimeMs: executionTime,
              attemptNumber: attempt,
            },
          });

          // Update job status
          await this.updateJobNextRun(prismaJob);
          await this.prisma.cronJob.update({
            where: { id: prismaJob.id },
            data: {
              status: CronJobStatus.SUCCESS,
            },
          });

          // Emit WebSocket event
          this.websocketGateway.emitExecutionCompleted(
            prismaJob.id,
            prismaJob.name,
            ExecutionStatus.SUCCESS,
          );

          this.logger.log(
            `Cron job ${prismaJob.name} (${prismaJob.id}) executed successfully in ${executionTime}ms`,
          );

          return {
            id: execution.id,
            status: ExecutionStatus.SUCCESS,
            responseStatus: result.status,
            executionTimeMs: executionTime,
            attemptNumber: attempt,
          };
        } catch (error: any) {
          lastError = error;
          attempt++;

          // Wait before retry (exponential backoff)
          if (attempt <= prismaJob.retryCount) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 60000); // Max 1 minute
            this.logger.warn(
              `Cron job ${prismaJob.name} (${prismaJob.id}) attempt ${attempt - 1} failed, retrying in ${backoffMs}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
        }
      }

      // All retries failed
      const executionTime = Date.now() - startTime;
      const errorMessage = lastError?.message || 'Unknown error';

      await this.prisma.cronExecution.update({
        where: { id: execution.id },
        data: {
          completedAt: new Date(),
          status: ExecutionStatus.FAILED,
          errorMessage,
          executionTimeMs: executionTime,
          attemptNumber: attempt - 1,
        },
      });

      // Update job status
      await this.updateJobNextRun(prismaJob);
      await this.prisma.cronJob.update({
        where: { id: prismaJob.id },
        data: {
          status: CronJobStatus.FAILED,
        },
      });

      // Emit WebSocket event
      this.websocketGateway.emitExecutionCompleted(
        prismaJob.id,
        prismaJob.name,
        ExecutionStatus.FAILED,
        errorMessage,
      );

      this.logger.error(
        `Cron job ${prismaJob.name} (${prismaJob.id}) failed after ${attempt - 1} attempts: ${errorMessage}`,
      );

      return {
        id: execution.id,
        status: ExecutionStatus.FAILED,
        errorMessage,
        executionTimeMs: executionTime,
        attemptNumber: attempt - 1,
      };
    } catch (error: any) {
      this.logger.error(`Fatal error executing cron job ${prismaJob.id}:`, error);

      // Update job status
      await this.prisma.cronJob.update({
        where: { id: prismaJob.id },
        data: {
          status: CronJobStatus.FAILED,
        },
      });

      // Emit WebSocket event
      this.websocketGateway.emitExecutionCompleted(
        prismaJob.id,
        prismaJob.name,
        ExecutionStatus.FAILED,
        error.message,
      );

      throw error;
    }
  }

  private async updateJobNextRun(prismaJob: PrismaCronJob): Promise<void> {
    try {
      const expression = CronExpressionParser.parse(prismaJob.cronExpression);
      const nextRunAt = expression.next().toDate();

      await this.prisma.cronJob.update({
        where: { id: prismaJob.id },
        data: { nextRunAt },
      });
    } catch (error) {
      this.logger.warn(`Failed to calculate next run time for job ${prismaJob.id}:`, error);
    }
  }
}

