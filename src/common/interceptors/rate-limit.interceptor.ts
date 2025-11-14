import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private store: RateLimitStore = {};
  private readonly limit: number;
  private readonly windowMs: number = 60000; // 1 minute

  constructor(private configService: ConfigService) {
    this.limit = parseInt(this.configService.get('API_RATE_LIMIT') || '100', 10);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const token = request.token?.id || request.user?.id || request.ip;
    const key = `rate_limit:${token}`;

    const now = Date.now();
    const record = this.store[key];

    // Clean up old records
    this.cleanup();

    if (!record || record.resetAt < now) {
      this.store[key] = {
        count: 1,
        resetAt: now + this.windowMs,
      };
    } else {
      record.count++;
      if (record.count > this.limit) {
        throw new HttpException(
          'Rate limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return next.handle().pipe(
      tap(() => {
        // Request successful
      }),
    );
  }

  private cleanup() {
    const now = Date.now();
    Object.keys(this.store).forEach((key) => {
      if (this.store[key].resetAt < now) {
        delete this.store[key];
      }
    });
  }
}

