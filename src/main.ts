import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { join } from 'path';
import { AppModule } from './app.module';
import { UnauthorizedExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get('PORT') || 3000;

  // Security middleware - configured to allow inline scripts for EJS templates
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
        imgSrc: ["'self'", "data:", "https:"],
        // Allow Socket.IO connections from same origin (works for both HTTP and HTTPS)
        connectSrc: [
          "'self'",
          "https://cdn.socket.io",
          "ws:",
          "wss:",
          "http://localhost:*",
          "https://localhost:*",
        ],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  
  // CORS configuration
  const corsOrigin = configService.get('CORS_ORIGIN') || 'http://localhost:3000';
  app.use(cors({
    origin: corsOrigin === '*' 
      ? (_origin, callback) => callback(null, true) // Allow all origins when '*'
      : corsOrigin,
    credentials: true,
  }));

  // Cookie parser
  app.use(cookieParser());

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Exception filter for unauthorized redirects
  app.useGlobalFilters(new UnauthorizedExceptionFilter());

  // View engine setup (EJS)
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');

  // Static files
  app.useStaticAssets(join(__dirname, '..', 'public'));

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();

