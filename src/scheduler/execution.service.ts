import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(private configService: ConfigService) {}

  async executeHttpRequest(
    url: string,
    method: string = 'GET',
    headers: Record<string, string> = {},
    body?: string,
    queryParams: Record<string, string> = {},
    timeoutMs: number = 30000,
  ): Promise<{ status: number; data: any }> {
    const config: AxiosRequestConfig = {
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
      const response: AxiosResponse = await axios(config);

      return {
        status: response.status,
        data: response.data,
      };
    } catch (error: any) {
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
        throw new Error(`No response received: ${error.message}`);
      }

      throw new Error(`Request failed: ${error.message}`);
    }
  }
}

