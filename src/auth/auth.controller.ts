import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateTokenDto } from './dto/create-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(
      dto,
      req.ip,
      req.get('user-agent'),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(
      dto,
      req.ip,
      req.get('user-agent'),
    );

    // Set httpOnly cookies - expiration matches JWT token expiration
    // Parse JWT_EXPIRES_IN (e.g., '1h', '15m') to milliseconds
    const jwtExpiresIn = this.configService.get('JWT_EXPIRES_IN') || '1h';
    let cookieMaxAge = 60 * 60 * 1000; // Default 1 hour
    if (jwtExpiresIn.endsWith('h')) {
      cookieMaxAge = parseInt(jwtExpiresIn) * 60 * 60 * 1000;
    } else if (jwtExpiresIn.endsWith('m')) {
      cookieMaxAge = parseInt(jwtExpiresIn) * 60 * 1000;
    } else if (jwtExpiresIn.endsWith('d')) {
      cookieMaxAge = parseInt(jwtExpiresIn) * 24 * 60 * 60 * 1000;
    }
    
    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax', // Changed from 'strict' to 'lax' to allow cookies after redirects
      path: '/', // Ensure cookie is available for all paths
      maxAge: cookieMaxAge,
    });

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax', // Changed from 'strict' to 'lax' to allow cookies after redirects
      path: '/', // Ensure cookie is available for all paths
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return result;
  }

  @Post('tokens')
  @UseGuards(JwtAuthGuard)
  async createToken(
    @Body() dto: CreateTokenDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.authService.createApiToken(
      user.id,
      dto,
      req.ip,
      req.get('user-agent'),
    );
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  async listTokens(@CurrentUser() user: any) {
    return this.authService.listApiTokens(user.id);
  }

  @Delete('tokens/:id')
  @UseGuards(JwtAuthGuard)
  async revokeToken(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.authService.revokeApiToken(user.id, id, req.ip, req.get('user-agent'));
  }
}

