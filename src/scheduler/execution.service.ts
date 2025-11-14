import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class ExecutionService implements OnModuleInit {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    // Create HTTP and HTTPS agents with connection pooling
    const httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      keepAliveMsecs: 30000,
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      keepAliveMsecs: 30000,
    });

    // Create shared axios instance with connection pooling
    this.axiosInstance = axios.create({
      httpAgent,
      httpsAgent,
      timeout: 30000, // Default timeout (can be overridden per request)
    });

    this.logger.log('HTTP connection pooling configured (maxSockets: 50, maxFreeSockets: 10)');
  }

  onModuleInit() {
    this.logger.log('ExecutionService initialized with HTTP connection pooling');
  }

  async executeHttpRequest(
    url: string,
    method: string = 'GET',
    headers: Record<string, string> = {},
    body?: string,
    queryParams: Record<string, string> = {},
    timeoutMs: number = 30000,
  ): Promise<{ status: number; data: unknown }> {
    const config: AxiosRequestConfig = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method: method.toUpperCase() as any,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: timeoutMs,
      validateStatus: () => true, // Don't throw on any status code
    };

    // Add query parameters
    if (Object.keys(queryParams).length > 0) {
      config.params = queryParams;
    }

    // Add body for POST, PUT, PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && body) {
      try {
        config.data = JSON.parse(body);
      } catch {
        config.data = body;
      }
    }

    this.logger.debug(`Executing ${method} request to ${url}`);

    try {
      // Use pooled axios instance instead of direct axios call
      const response: AxiosResponse = await this.axiosInstance(config);

      return {
        status: response.status,
        data: response.data,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }

        if (error.response) {
          // Server responded with error status
          return {
            status: error.response.status,
            data: error.response.data,
          };
        }

        if (error.request) {
          throw new Error(`No response received: ${error.message || 'Unknown error'}`);
        }
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Request failed: ${errorMessage}`);
    }
  }
}

