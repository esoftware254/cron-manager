import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionStatus, CronJobStatus } from '@prisma/client';

@Injectable()
export class MonitoringService {
  constructor(private prisma: PrismaService) {}

  async getExecutionHistory(
    cronJobId: string,
    filters: {
      status?: ExecutionStatus;
      startDate?: Date;
      endDate?: Date;
      skip?: number;
      take?: number;
    },
  ) {
    const where: any = {
      cronJobId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.startedAt = {};
      if (filters.startDate) {
        where.startedAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.startedAt.lte = filters.endDate;
      }
    }

    const logs = await this.prisma.cronExecution.findMany({
      where,
      include: {
        cronJob: {
          select: {
            id: true,
            name: true,
            endpointUrl: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      skip: filters.skip || 0,
      take: filters.take || 100,
    });

    // Clean HTML responses from existing records
    const cleanedLogs = await Promise.all(
      logs.map(async (log) => {
        if (!log.responseBody) {
          return log;
        }

        let responseStr: string;
        if (typeof log.responseBody === 'string') {
          responseStr = log.responseBody;
        } else {
          responseStr = String(log.responseBody);
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
          // Update the database to remove HTML response
          await this.prisma.cronExecution.update({
            where: { id: log.id },
            data: { responseBody: null },
          });

          // Return log with cleaned responseBody
          return {
            ...log,
            responseBody: null,
          };
        }

        return log;
      }),
    );

    return cleanedLogs;
  }

  async getJobLogs(cronJobId: string, filters: {
    status?: ExecutionStatus;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  }) {
    return this.getExecutionHistory(cronJobId, filters);
  }

  async getGlobalLogs(filters: {
    cronJobId?: string;
    status?: ExecutionStatus;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};

    if (filters.cronJobId) {
      where.cronJobId = filters.cronJobId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.startedAt = {};
      if (filters.startDate) {
        where.startedAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.startedAt.lte = filters.endDate;
      }
    }

    const logs = await this.prisma.cronExecution.findMany({
      where,
      include: {
        cronJob: {
          select: {
            id: true,
            name: true,
            endpointUrl: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      skip: filters.skip || 0,
      take: filters.take || 100,
    });

    // Clean HTML responses from existing records
    const cleanedLogs = await Promise.all(
      logs.map(async (log) => {
        if (!log.responseBody) {
          return log;
        }

        let responseStr: string;
        if (typeof log.responseBody === 'string') {
          responseStr = log.responseBody;
        } else {
          responseStr = String(log.responseBody);
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
          // Update the database to remove HTML response
          await this.prisma.cronExecution.update({
            where: { id: log.id },
            data: { responseBody: null },
          });

          // Return log with cleaned responseBody
          return {
            ...log,
            responseBody: null,
          };
        }

        return log;
      }),
    );

    return cleanedLogs;
  }

  async getStats(userId?: string) {
    const where: any = {};

    if (userId) {
      where.OR = [
        { createdBy: userId },
        { updatedBy: userId },
      ];
    }

    const [
      totalJobs,
      activeJobs,
      inactiveJobs,
      pendingJobs,
      runningJobs,
      successJobs,
      failedJobs,
      executionsToday,
      successExecutionsToday,
      failedExecutionsToday,
    ] = await Promise.all([
      this.prisma.cronJob.count({ where }),
      this.prisma.cronJob.count({ where: { ...where, isActive: true } }),
      this.prisma.cronJob.count({ where: { ...where, isActive: false } }),
      this.prisma.cronJob.count({ where: { ...where, status: CronJobStatus.PENDING } }),
      this.prisma.cronJob.count({ where: { ...where, status: CronJobStatus.RUNNING } }),
      this.prisma.cronJob.count({ where: { ...where, status: CronJobStatus.SUCCESS } }),
      this.prisma.cronJob.count({ where: { ...where, status: CronJobStatus.FAILED } }),
      this.getExecutionsCountToday(),
      this.getExecutionsCountToday(ExecutionStatus.SUCCESS),
      this.getExecutionsCountToday(ExecutionStatus.FAILED),
    ]);

    return {
      jobs: {
        total: totalJobs,
        active: activeJobs,
        inactive: inactiveJobs,
        byStatus: {
          pending: pendingJobs,
          running: runningJobs,
          success: successJobs,
          failed: failedJobs,
        },
      },
      executions: {
        today: executionsToday,
        successToday: successExecutionsToday,
        failedToday: failedExecutionsToday,
      },
    };
  }

  private async getExecutionsCountToday(status?: ExecutionStatus) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const where: any = {
      startedAt: {
        gte: startOfDay,
      },
    };

    if (status) {
      where.status = status;
    }

    return this.prisma.cronExecution.count({ where });
  }

  async getScheduleChanges(cronJobId: string, filters: {
    skip?: number;
    take?: number;
  }) {
    return this.prisma.scheduleChange.findMany({
      where: { cronJobId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: {
        changedAt: 'desc',
      },
      skip: filters.skip || 0,
      take: filters.take || 100,
    });
  }
}

