import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(UnauthorizedException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // List of API endpoints that should return JSON (not HTML pages)
    const apiEndpoints = [
      '/stats', '/logs', '/audit', '/api/logs', '/api/audit', '/cron',
      '/auth/tokens', '/auth/login', '/auth/register',
      '/cron/validate',
    ];
    
    // Check if this is a view request (HTML) or API request (JSON)
    const acceptHeader = (request.headers.accept || '').toLowerCase();
    const contentTypeHeader = (request.headers['content-type'] || '').toLowerCase();
    const isApiEndpoint = apiEndpoints.some(endpoint => request.path.startsWith(endpoint));
    const hasJsonAccept = acceptHeader.includes('application/json');
    const hasJsonContentType = contentTypeHeader.includes('application/json');
    const isFetchRequest = request.headers['x-requested-with'] === 'XMLHttpRequest' || 
                          request.headers['sec-fetch-mode'] === 'cors' ||
                          request.headers['sec-fetch-dest'] === 'empty';
    
    // Treat as API request if:
    // 1. Path starts with known API endpoint AND has JSON accept header
    // 2. Accept header includes application/json
    // 3. Content-Type is application/json (POST/PUT requests)
    // 4. It's a fetch/XHR request
    const isApiRequest = (isApiEndpoint && hasJsonAccept) || hasJsonAccept || hasJsonContentType || isFetchRequest;

    if (isApiRequest) {
      // For API requests, return JSON error
      response.status(401).json({
        statusCode: 401,
        message: exception.message,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    } else {
      // For view requests, redirect to login
      response.redirect('/login');
    }
  }
}

