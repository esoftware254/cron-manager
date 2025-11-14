import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CronJobsService } from './cron-jobs.service';
import { CreateCronJobDto } from './dto/create-cron-job.dto';
import { UpdateCronJobDto } from './dto/update-cron-job.dto';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permission } from '@prisma/client';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { UseInterceptors } from '@nestjs/common';

@Controller('cron')
@UseGuards(ApiTokenGuard)
@UseInterceptors(RateLimitInterceptor)
export class CronJobsController {
  constructor(private readonly cronJobsService: CronJobsService) {}

  @Post()
  @RequirePermissions(Permission.WRITE, Permission.ADMIN)
  async create(
    @Body() createCronJobDto: CreateCronJobDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.cronJobsService.create(
      createCronJobDto,
      user.id,
      req.ip,
      req.get('user-agent'),
    );
  }

  @Get()
  @RequirePermissions(Permission.READ, Permission.ADMIN)
  async findAll(
    @Query('isActive') isActive?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @CurrentUser() user?: any,
  ) {
    const filters: any = {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 100,
    };

    // Non-admin users can only see their own jobs
    if (user?.role !== 'ADMIN') {
      filters.userId = user.id;
      filters.userRole = user.role;
    }

    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }

    if (status) {
      filters.status = status;
    }

    return this.cronJobsService.findAll(filters);
  }

  @Get(':id')
  @RequirePermissions(Permission.READ, Permission.ADMIN)
  async findOne(@Param('id') id: string) {
    return this.cronJobsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.WRITE, Permission.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateCronJobDto: UpdateCronJobDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.cronJobsService.update(id, updateCronJobDto, user.id, req.ip, req.get('user-agent'));
  }

  @Delete(':id')
  @RequirePermissions(Permission.DELETE, Permission.ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.cronJobsService.remove(id, user.id, req.ip, req.get('user-agent'));
  }

  @Post(':id/toggle')
  @RequirePermissions(Permission.WRITE, Permission.ADMIN)
  async toggle(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.cronJobsService.toggle(id, user.id, req.ip, req.get('user-agent'));
  }

  @Post(':id/execute')
  @RequirePermissions(Permission.EXECUTE, Permission.ADMIN)
  async execute(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.cronJobsService.execute(id, user.id, req.ip, req.get('user-agent'));
  }

  @Post('validate')
  @RequirePermissions(Permission.READ, Permission.ADMIN)
  async validateCronExpression(@Body() body: { cronExpression: string }) {
    return this.cronJobsService.validateCronExpression(body.cronExpression);
  }
}

