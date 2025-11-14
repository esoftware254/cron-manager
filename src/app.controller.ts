import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('api')
export class AppController {
  constructor(private configService: ConfigService) {}

  @Get()
  root() {
    return {
      message: 'Cron Manager API',
      version: '1.0.0',
      docs: '/api/docs',
    };
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}

