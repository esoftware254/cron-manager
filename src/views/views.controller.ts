/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Controller, Get, Render, Req, UseGuards, Redirect } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller()
export class ViewsController {
  constructor() {}

  @Get('login')
  @Render('login')
  async login() {
    return {
      title: 'Login',
    };
  }

  @Get('register')
  @Render('register')
  async register() {
    return {
      title: 'Register',
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @Render('index')
  async dashboard(@CurrentUser() user: any, @Req() req: Request) {
    return {
      title: 'Dashboard',
      user: user,
    };
  }

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  @Render('jobs')
  async jobs(@CurrentUser() user: any) {
    return {
      title: 'Cron Jobs',
      user: user,
    };
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @Render('logs')
  async logs(@CurrentUser() user: any) {
    return {
      title: 'Execution Logs',
      user: user,
    };
  }

  @Get('audit')
  @UseGuards(JwtAuthGuard)
  @Render('audit')
  async audit(@CurrentUser() user: any) {
    return {
      title: 'Audit Trail',
      user: user,
    };
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  @Render('tokens')
  async tokens(@CurrentUser() user: any) {
    return {
      title: 'API Tokens',
      user: user,
    };
  }
}

