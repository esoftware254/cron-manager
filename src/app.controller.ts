import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class AppController {
  @Get()
  root() {
    return {
      message: 'Cron Manager API',
      version: '1.0.0',
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

