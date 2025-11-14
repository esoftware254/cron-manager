import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuditLogDto } from './dto/audit-log.dto';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: CreateAuditLogDto) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          userId: data.userId,
          tokenId: data.tokenId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          requestPayload: data.requestPayload || {},
          responseStatus: data.responseStatus,
        },
      });
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('Failed to create audit log:', error);
      return null;
    }
  }

  async findAll(filters: {
    userId?: string;
    tokenId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.tokenId) {
      where.tokenId = filters.tokenId;
    }

    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }

    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        token: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      skip: filters.skip || 0,
      take: filters.take || 100,
    });
  }
}

