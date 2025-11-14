import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    // Allow access if cookie exists or Authorization header is present
    if (request.cookies?.access_token || request.headers.authorization) {
      return super.canActivate(context);
    }
    // No token found
    throw new UnauthorizedException('Authentication required. Please log in.');
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token. Please log in again.');
    }
    return user;
  }
}

