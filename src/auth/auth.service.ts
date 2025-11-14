import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateTokenDto } from './dto/create-token.dto';
import { AuditService } from '../audit/audit.service';
import { UserRole, Permission } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role || UserRole.USER,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      action: 'USER_REGISTERED',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress,
      userAgent,
      responseStatus: 201,
    });

    return user;
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        resourceType: 'AUTH',
        ipAddress,
        userAgent,
        requestPayload: { email: dto.email },
        responseStatus: 401,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      await this.auditService.log({
        action: 'LOGIN_FAILED',
        resourceType: 'AUTH',
        userId: user.id,
        ipAddress,
        userAgent,
        requestPayload: { email: dto.email },
        responseStatus: 401,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT tokens
    const payload = { email: user.email, sub: user.id, role: user.role };
    // Use 1h expiration to match cookie maxAge, or use configured value
    const jwtExpiresIn = this.configService.get('JWT_EXPIRES_IN') || '1h';
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: jwtExpiresIn,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET') || 'refresh-secret',
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    await this.auditService.log({
      action: 'LOGIN_SUCCESS',
      resourceType: 'AUTH',
      userId: user.id,
      ipAddress,
      userAgent,
      responseStatus: 200,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async createApiToken(userId: string, dto: CreateTokenDto, ipAddress?: string, userAgent?: string) {
    // Generate token (format: tasker001, tasker002, etc.)
    const tokenCount = await this.prisma.apiToken.count({
      where: { userId },
    });
    const tokenNumber = (tokenCount + 1).toString().padStart(3, '0');
    const token = `tasker${tokenNumber}`;

    const apiToken = await this.prisma.apiToken.create({
      data: {
        token,
        userId,
        name: dto.name,
        permissions: dto.permissions,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    await this.auditService.log({
      action: 'API_TOKEN_CREATED',
      resourceType: 'API_TOKEN',
      resourceId: apiToken.id,
      userId,
      tokenId: apiToken.id,
      ipAddress,
      userAgent,
      requestPayload: { name: dto.name, permissions: dto.permissions },
      responseStatus: 201,
    });

    return apiToken;
  }

  async listApiTokens(userId: string) {
    return this.prisma.apiToken.findMany({
      where: { userId },
      select: {
        id: true,
        token: true,
        name: true,
        permissions: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async revokeApiToken(userId: string, tokenId: string, ipAddress?: string, userAgent?: string) {
    const token = await this.prisma.apiToken.findFirst({
      where: {
        id: tokenId,
        userId,
      },
    });

    if (!token) {
      throw new NotFoundException('Token not found');
    }

    await this.prisma.apiToken.update({
      where: { id: tokenId },
      data: { isActive: false },
    });

    await this.auditService.log({
      action: 'API_TOKEN_REVOKED',
      resourceType: 'API_TOKEN',
      resourceId: tokenId,
      userId,
      tokenId,
      ipAddress,
      userAgent,
      responseStatus: 200,
    });

    return { message: 'Token revoked successfully' };
  }
}

