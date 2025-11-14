/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCronJobDto } from './dto/create-cron-job.dto';
import { UpdateCronJobDto } from './dto/update-cron-job.dto';
import { SchedulerService } from '../scheduler/scheduler.service';
import { AuditService } from '../audit/audit.service';
import { ExecutionService } from '../scheduler/execution.service';
import { CronJobStatus } from '@prisma/client';
import * as cronParser from 'node-cron';
import { CronExpressionParser } from 'cron-parser';

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);

  constructor(
    private prisma: PrismaService,
    private schedulerService: SchedulerService,
    private auditService: AuditService,
    private executionService: ExecutionService,
  ) {}

  async create(dto: CreateCronJobDto, userId: string, ipAddress?: string, userAgent?: string) {
    // Validate cron expression
    if (!cronParser.validate(dto.cronExpression)) {
      throw new BadRequestException('Invalid cron expression');
    }

    // Validate endpoint returns JSON (not HTML)
    await this.validateEndpointReturnsJson(
      dto.endpointUrl,
      dto.httpMethod || 'GET',
      dto.headers || {},
      dto.body,
      dto.queryParams || {},
      dto.timeoutMs || 10000,
    );

    // Calculate next run time
    let nextRunAt: Date | null = null;
    try {
      const expression = CronExpressionParser.parse(dto.cronExpression);
      nextRunAt = expression.next().toDate();
    } catch (error) {
      // Invalid cron expression, will be caught by validation
    }

    const cronJob = await this.prisma.cronJob.create({
      data: {
        name: dto.name,
        description: dto.description,
        cronExpression: dto.cronExpression,
        timezone: dto.timezone || 'UTC',
        endpointUrl: dto.endpointUrl,
        httpMethod: dto.httpMethod || 'GET',
        headers: dto.headers || {},
        body: dto.body,
        queryParams: dto.queryParams || {},
        isActive: dto.isActive ?? true,
        retryCount: dto.retryCount ?? 3,
        timeoutMs: dto.timeoutMs ?? 30000,
        createdBy: userId,
        updatedBy: userId,
        nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
        status: CronJobStatus.PENDING,
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Register with scheduler if active
    if (cronJob.isActive) {
      await this.schedulerService.registerJob(cronJob);
    }

    await this.auditService.log({
      action: 'CRON_JOB_CREATED',
      resourceType: 'CRON_JOB',
      resourceId: cronJob.id,
      userId,
      ipAddress,
      userAgent,
      requestPayload: dto,
      responseStatus: 201,
    });

    return cronJob;
  }

  async findAll(filters: {
    userId?: string;
    isActive?: boolean;
    status?: CronJobStatus;
    skip?: number;
    take?: number;
    userRole?: string;
  }) {
    const where: any = {};

    // Non-admin users can only see their own jobs
    if (filters.userId && filters.userRole !== 'ADMIN') {
      where.OR = [
        { createdBy: filters.userId },
        { updatedBy: filters.userId },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    return this.prisma.cronJob.findMany({
      where,
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        updatedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: filters.skip || 0,
      take: filters.take || 100,
    });
  }

  async findOne(id: string) {
    const cronJob = await this.prisma.cronJob.findUnique({
      where: { id },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        updatedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!cronJob) {
      throw new NotFoundException('Cron job not found');
    }

    return cronJob;
  }

  async update(
    id: string,
    dto: UpdateCronJobDto,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const existingJob = await this.findOne(id);

    // Check permission
    if (existingJob.createdBy !== userId) {
      throw new ForbiddenException('You can only update your own cron jobs');
    }

    // Validate cron expression if provided
    if (dto.cronExpression && !cronParser.validate(dto.cronExpression)) {
      throw new BadRequestException('Invalid cron expression');
    }

    // Validate endpoint returns JSON (not HTML) if endpointUrl is being updated
    if (dto.endpointUrl && dto.endpointUrl !== existingJob.endpointUrl) {
      await this.validateEndpointReturnsJson(
        dto.endpointUrl,
        dto.httpMethod || existingJob.httpMethod || 'GET',
        dto.headers || (existingJob.headers as Record<string, string>) || {},
        dto.body !== undefined ? dto.body : existingJob.body,
        dto.queryParams || (existingJob.queryParams as Record<string, string>) || {},
        dto.timeoutMs || existingJob.timeoutMs || 10000,
      );
    }

    // Track schedule changes
    const cronExpressionChanged = dto.cronExpression && dto.cronExpression !== existingJob.cronExpression;
    
    if (cronExpressionChanged) {
      // Calculate next run time
      let nextRunAt: Date | null = null;
      try {
        const expression = CronExpressionParser.parse(dto.cronExpression);
        nextRunAt = expression.next().toDate();
      } catch (error) {
        // Invalid cron expression, will be caught by validation
      }

      // Record schedule change
      await this.prisma.scheduleChange.create({
        data: {
          cronJobId: id,
          oldCronExpression: existingJob.cronExpression,
          newCronExpression: dto.cronExpression,
          changedBy: userId,
        },
      });

      (dto as any).nextRunAt = nextRunAt;
    }

    // Update job
    const updatedJob = await this.prisma.cronJob.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: userId,
        updatedAt: new Date(),
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        updatedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Re-register with scheduler
    await this.schedulerService.unregisterJob(id);
    if (updatedJob.isActive) {
      await this.schedulerService.registerJob(updatedJob);
    }

    await this.auditService.log({
      action: 'CRON_JOB_UPDATED',
      resourceType: 'CRON_JOB',
      resourceId: id,
      userId,
      ipAddress,
      userAgent,
      requestPayload: dto,
      responseStatus: 200,
    });

    return updatedJob;
  }

  async remove(id: string, userId: string, ipAddress?: string, userAgent?: string) {
    const cronJob = await this.findOne(id);

    // Check permission
    if (cronJob.createdBy !== userId) {
      throw new ForbiddenException('You can only delete your own cron jobs');
    }

    // Unregister from scheduler
    await this.schedulerService.unregisterJob(id);

    // Delete job
    await this.prisma.cronJob.delete({
      where: { id },
    });

    await this.auditService.log({
      action: 'CRON_JOB_DELETED',
      resourceType: 'CRON_JOB',
      resourceId: id,
      userId,
      ipAddress,
      userAgent,
      responseStatus: 200,
    });

    return { message: 'Cron job deleted successfully' };
  }

  async toggle(id: string, userId: string, ipAddress?: string, userAgent?: string) {
    const cronJob = await this.findOne(id);

    // Check permission
    if (cronJob.createdBy !== userId) {
      throw new ForbiddenException('You can only toggle your own cron jobs');
    }

    const updatedJob = await this.prisma.cronJob.update({
      where: { id },
      data: {
        isActive: !cronJob.isActive,
        updatedBy: userId,
      },
    });

    // Register or unregister with scheduler
    if (updatedJob.isActive) {
      await this.schedulerService.registerJob(updatedJob);
    } else {
      await this.schedulerService.unregisterJob(id);
    }

    await this.auditService.log({
      action: 'CRON_JOB_TOGGLED',
      resourceType: 'CRON_JOB',
      resourceId: id,
      userId,
      ipAddress,
      userAgent,
      requestPayload: { isActive: updatedJob.isActive },
      responseStatus: 200,
    });

    return updatedJob;
  }

  async execute(id: string, userId: string, ipAddress?: string, userAgent?: string) {
    const cronJob = await this.findOne(id);

    // Check permission
    if (cronJob.createdBy !== userId) {
      throw new ForbiddenException('You can only execute your own cron jobs');
    }

    // Execute immediately
    const execution = await this.schedulerService.executeJob(cronJob);

    await this.auditService.log({
      action: 'CRON_JOB_EXECUTED_MANUAL',
      resourceType: 'CRON_JOB',
      resourceId: id,
      userId,
      ipAddress,
      userAgent,
      responseStatus: 200,
    });

    return execution;
  }

  async validateCronExpression(cronExpression: string) {
    // Validate cron expression
    if (!cronParser.validate(cronExpression)) {
      return {
        valid: false,
        error: 'Invalid cron expression format',
      };
    }

    // Calculate next run time
    try {
      const expression = CronExpressionParser.parse(cronExpression);
      const nextRun = expression.next().toDate();
      const secondRun = expression.next().toDate();
      
      return {
        valid: true,
        nextRun: nextRun.toISOString(),
        secondRun: secondRun.toISOString(),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid cron expression',
      };
    }
  }

  /**
   * Validates that an endpoint returns JSON (not HTML)
   * Throws BadRequestException if HTML is detected
   */
  private async validateEndpointReturnsJson(
    endpointUrl: string,
    httpMethod: string = 'GET',
    headers: Record<string, string> = {},
    body?: string,
    queryParams: Record<string, string> = {},
    timeoutMs: number = 10000, // Shorter timeout for validation
  ): Promise<void> {
    try {
      const result = await this.executionService.executeHttpRequest(
        endpointUrl,
        httpMethod,
        headers,
        body,
        queryParams,
        timeoutMs,
      );

      // Convert response data to string for HTML detection
      let responseStr: string;
      if (typeof result.data === 'string') {
        responseStr = result.data;
      } else if (result.data === null || result.data === undefined) {
        // Empty response is acceptable
        return;
      } else {
        // Try to stringify, if it fails it might be HTML
        try {
          responseStr = JSON.stringify(result.data);
        } catch {
          responseStr = String(result.data);
        }
      }

      const trimmed = responseStr.trim();

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
        throw new BadRequestException(
          'Endpoint returned HTML instead of JSON. Please ensure the URL points to a valid API endpoint that returns JSON.',
        );
      }

      // Try to parse as JSON to ensure it's valid JSON
      try {
        JSON.parse(trimmed);
      } catch {
        // If it's not parseable JSON but also not HTML, that's acceptable
        // (some APIs return plain text or other formats)
        // But we'll still allow it since the user explicitly wants JSON-only validation
        // For now, we only reject HTML
      }
    } catch (error: any) {
      // If it's already a BadRequestException (HTML detected), re-throw it
      if (error instanceof BadRequestException) {
        throw error;
      }

      // For network errors, log a warning but don't block job creation
      // This allows jobs to be created even if the endpoint is temporarily unavailable
      this.logger.warn(
        `Could not validate endpoint ${endpointUrl}: ${error.message}. Job will be created anyway.`,
      );
    }
  }
}

