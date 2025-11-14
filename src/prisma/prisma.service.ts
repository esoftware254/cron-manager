import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Get database URL and pool configuration from environment variables
    // Note: We read from process.env directly to avoid issues with ConfigService initialization
    const databaseUrl = process.env.DATABASE_URL;
    const connectionLimit = process.env.DATABASE_CONNECTION_LIMIT || '20';
    const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || '20';

    // Configure connection pool via DATABASE_URL query parameters
    let finalDatabaseUrl: string | undefined = databaseUrl;

    if (databaseUrl) {
      // Check if URL already has connection pool parameters
      const hasConnectionParams = databaseUrl.includes('connection_limit') || databaseUrl.includes('pool_timeout');
      
      if (!hasConnectionParams) {
        try {
          // Parse URL and add connection pool parameters
          const url = new URL(databaseUrl);
          url.searchParams.set('connection_limit', connectionLimit);
          url.searchParams.set('pool_timeout', poolTimeout);
          finalDatabaseUrl = url.toString();
        } catch {
          // If URL parsing fails, append query params directly
          const separator = databaseUrl.includes('?') ? '&' : '?';
          finalDatabaseUrl = `${databaseUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`;
        }
      }
    }

    // Call super with configured database URL (or undefined to use default from env)
    if (finalDatabaseUrl && finalDatabaseUrl !== databaseUrl) {
      super({
        datasources: {
          db: {
            url: finalDatabaseUrl,
          },
        },
      });
    } else {
      // Use default constructor (will use DATABASE_URL from environment as-is)
      super();
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

