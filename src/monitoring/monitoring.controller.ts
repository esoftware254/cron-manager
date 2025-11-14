/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permission } from '@prisma/client';
import { CurrentUser } from '../common/decorators/user.decorator';
import { ExecutionStatus } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard)
export class MonitoringController {
  constructor(private monitoringService: MonitoringService) {}

  @Get('cron/:id/executions')
  async getExecutionHistory(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.monitoringService.getExecutionHistory(id, {
      status: status as ExecutionStatus,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 100,
    });
  }

  @Get('cron/:id/logs')
  async getJobLogs(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.monitoringService.getJobLogs(id, {
      status: status as ExecutionStatus,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 100,
    });
  }

  @Get('api/logs')
  async getGlobalLogs(
    @Query('cronJobId') cronJobId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.monitoringService.getGlobalLogs({
      cronJobId,
      status: status as ExecutionStatus,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 100,
    });
  }

  @Get('stats')
  async getStats(@CurrentUser() user?: any) {
    // Non-admin users only see their own stats
    const userId = user?.role === 'ADMIN' ? undefined : user?.id;
    return this.monitoringService.getStats(userId);
  }

  @Get('cron/:id/schedule-changes')
  async getScheduleChanges(
    @Param('id') id: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.monitoringService.getScheduleChanges(id, {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 100,
    });
  }
}

