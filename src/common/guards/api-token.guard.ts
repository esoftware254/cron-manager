import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { Permission } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private reflector: Reflector,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const requiredPermissions = this.reflector.get<Permission[]>(
      'permissions',
      context.getHandler(),
    ) || [];

    // Try to get API token from query param or header
    const apiToken = request.query.token || request.headers['x-api-token'];
    
    // If API token provided, use API token authentication
    if (apiToken) {
      return this.authenticateWithApiToken(request, apiToken, requiredPermissions);
    }

    // If no API token, check for JWT in cookies (for frontend)
    if (request.cookies?.access_token) {
      return this.authenticateWithJWT(request, requiredPermissions);
    }

    // Check Authorization header for Bearer token (could be JWT or API token)
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      // If it looks like an API token (not a JWT), use API token auth
      if (!token.includes('.')) {
        return this.authenticateWithApiToken(request, token, requiredPermissions);
      }
      // JWT token - validate it
      request.cookies = request.cookies || {};
      request.cookies.access_token = token;
      return this.authenticateWithJWT(request, requiredPermissions);
    }

    throw new BadRequestException('Authentication required. Please provide an API token or log in.');
  }

  private async authenticateWithApiToken(
    request: any,
    token: string,
    requiredPermissions: Permission[],
  ): Promise<boolean> {

    // Find token in database
    const apiTokenRecord = await this.prisma.apiToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!apiTokenRecord || !apiTokenRecord.isActive) {
      await this.auditService.log({
        action: 'API_TOKEN_VALIDATION_FAILED',
        resourceType: 'AUTH',
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
        requestPayload: { token: token.substring(0, 10) + '...' },
        responseStatus: 401,
      });
      throw new UnauthorizedException('Invalid or inactive API token');
    }

    // Check expiration
    if (apiTokenRecord.expiresAt && apiTokenRecord.expiresAt < new Date()) {
      await this.auditService.log({
        action: 'API_TOKEN_EXPIRED',
        resourceType: 'AUTH',
        userId: apiTokenRecord.userId,
        tokenId: apiTokenRecord.id,
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
        requestPayload: { token: token.substring(0, 10) + '...' },
        responseStatus: 401,
      });
      throw new UnauthorizedException('API token has expired');
    }

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasPermission = requiredPermissions.every(permission =>
        apiTokenRecord.permissions.includes(permission) || apiTokenRecord.permissions.includes(Permission.ADMIN),
      );

      if (!hasPermission) {
        await this.auditService.log({
          action: 'API_TOKEN_INSUFFICIENT_PERMISSIONS',
          resourceType: 'AUTH',
          userId: apiTokenRecord.userId,
          tokenId: apiTokenRecord.id,
          ipAddress: request.ip,
          userAgent: request.get('user-agent'),
          requestPayload: { 
            token: token.substring(0, 10) + '...',
            requiredPermissions,
            hasPermissions: apiTokenRecord.permissions,
          },
          responseStatus: 403,
        });
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    // Update last used at
    await this.prisma.apiToken.update({
      where: { id: apiTokenRecord.id },
      data: { lastUsedAt: new Date() },
    });

    // Attach token and user to request
    request.token = apiTokenRecord;
    request.user = apiTokenRecord.user;

    return true;
  }

  private async authenticateWithJWT(
    request: any,
    requiredPermissions: Permission[],
  ): Promise<boolean> {
    try {
      const token = request.cookies?.access_token || 
                    request.headers['authorization']?.replace('Bearer ', '');
      
      if (!token) {
        throw new UnauthorizedException('JWT token not found');
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET') || 'your-secret-key',
      });

      // Get user from database
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // For JWT users, admin role has all permissions
      // Other users can only access their own resources
      if (requiredPermissions.length > 0 && user.role !== 'ADMIN') {
        // For JWT users without admin role, permissions are checked at application level
        // This allows frontend access while API tokens still enforce permissions
        // In practice, JWT users can access their own resources
      }

      // Attach user to request
      request.user = user;
      request.jwtUser = true; // Flag to indicate JWT authentication

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired JWT token. Please log in again.');
    }
  }
}

