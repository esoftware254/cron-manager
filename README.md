# Cron Manager

A production-ready cron management system built with NestJS, Prisma, and PostgreSQL. This system provides a comprehensive solution for managing, monitoring, and automatically rescheduling cron jobs.

## Features

- **CRUD Operations** - Full Create, Read, Update, Delete support for cron jobs
- **Authentication & Authorization** - JWT-based authentication and API token system with permission scopes
- **Job Scheduling** - Dynamic cron job registration and execution using `@nestjs/schedule`
- **Execution Engine** - HTTP request execution with retry logic, exponential backoff, and timeout handling
- **Monitoring & Logging** - Complete execution history, audit logs, and statistics
- **Real-time Updates** - WebSocket support for live execution status updates
- **Auto-rescheduling** - Intelligent schedule adjustment based on performance metrics
- **Frontend Dashboard** - EJS-based dashboard with TailwindCSS for managing jobs and viewing logs
- **Security** - Rate limiting, audit logging, and permission-based access control

## Prerequisites

- Node.js 18+ or 20+
- PostgreSQL 14+ or MySQL 8+
- pnpm (recommended) or npm

## Installation

1. Clone the repository and install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/cron_manager?schema=public"

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_REFRESH_EXPIRES_IN=7d

# Token Configuration
TOKEN_SALT=your-token-salt-change-in-production

# API Configuration
PORT=3000
API_RATE_LIMIT=100

# CORS
# Set to '*' to allow all origins (for development)
# For production, set to your frontend domain
CORS_ORIGIN=*

# Logging
LOG_LEVEL=info

# Feature Flags
AUTO_RESCHEDULING_ENABLED=true
MAX_CONCURRENT_EXECUTIONS=10
LOG_RETENTION_DAYS=30
```

3. Set up the database:

```bash
# Generate Prisma Client
pnpm prisma:generate

# Run migrations
pnpm prisma:migrate
```

4. Build the TailwindCSS styles:

```bash
# Build CSS (requires TailwindCSS CLI or build process)
npx tailwindcss -i ./public/css/input.css -o ./public/css/output.css --watch
```

## Running the Application

```bash
# Development
pnpm start:dev

# Production
pnpm build
pnpm start:prod
```

The application will be available at `http://localhost:3000`

## API Documentation

### Authentication Endpoints

- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login (returns JWT tokens)
- `POST /auth/tokens` - Create API token (requires JWT)
- `GET /auth/tokens` - List user's API tokens (requires JWT)
- `DELETE /auth/tokens/:id` - Revoke API token (requires JWT)

### Cron Job Management Endpoints

All endpoints require an API token via query parameter (`?token=xxx`) or header (`X-API-Token` or `Authorization: Bearer xxx`).

- `GET /cron?token=xxx` - List all cron jobs (with filtering)
- `POST /cron?token=xxx` - Create new cron job
- `GET /cron/:id?token=xxx` - Get single cron job details
- `PATCH /cron/:id?token=xxx` - Update cron job (reschedule)
- `DELETE /cron/:id?token=xxx` - Delete cron job
- `POST /cron/:id/toggle?token=xxx` - Enable/disable cron job
- `POST /cron/:id/execute?token=xxx` - Manually trigger job execution

### Monitoring Endpoints

- `GET /cron/:id/executions?token=xxx` - Execution history for a job
- `GET /cron/:id/logs?token=xxx` - Job-specific logs
- `GET /api/logs?token=xxx` - Global execution logs
- `GET /api/audit?token=xxx` - Security audit trail
- `GET /stats?token=xxx` - Dashboard statistics

### WebSocket Events

Connect to `ws://localhost:3000/ws` to receive real-time updates:

- `cron:created` - New cron job created
- `cron:updated` - Cron job updated
- `cron:deleted` - Cron job deleted
- `execution:started` - Job execution started
- `execution:completed` - Job execution completed
- `execution:failed` - Job execution failed
- `schedule:changed` - Schedule changed

## Usage Examples

### Creating a Cron Job

```bash
curl -X POST "http://localhost:3000/cron?token=your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Backup",
    "description": "Runs daily backup job",
    "cronExpression": "0 2 * * *",
    "endpointUrl": "https://api.example.com/backup",
    "httpMethod": "POST",
    "headers": {
      "Authorization": "Bearer your-backup-token"
    },
    "timezone": "UTC",
    "retryCount": 3,
    "timeoutMs": 30000
  }'
```

### Listing Cron Jobs

```bash
curl "http://localhost:3000/cron?token=your-api-token"
```

### Executing a Job Manually

```bash
curl -X POST "http://localhost:3000/cron/job-id/execute?token=your-api-token"
```

## API Token Permissions

API tokens support the following permission scopes:

- `READ` - View cron jobs, logs, and statistics
- `WRITE` - Create and update cron jobs
- `DELETE` - Delete cron jobs
- `EXECUTE` - Manually trigger job executions
- `ADMIN` - Full access (includes all permissions)

## Auto-rescheduling

The system automatically reschedules jobs based on performance metrics:

- **Success-based**: Keeps schedule if 95%+ success rate
- **Failure-based**: Extends interval by 2x if >50% failures
- **Timeout-based**: Reduces frequency if frequent timeouts
- **Load-based**: Distributes jobs to avoid congestion
- **Consecutive failures**: Disables job after 3 consecutive failures

Auto-rescheduling runs every hour and can be disabled via `AUTO_RESCHEDULING_ENABLED=false`.

## Frontend Dashboard

Access the web dashboard at `http://localhost:3000`:

- **Dashboard** - Overview of jobs and execution statistics
- **Jobs** - List and manage all cron jobs
- **Logs** - View execution history (uses `/api/logs` under the hood)
- **Audit** - Security audit trail (`/api/audit`)
- **API Tokens** - Manage API tokens (requires login)

## Database Schema

The system uses Prisma with the following main tables:

- `users` - User accounts
- `api_tokens` - API tokens with permissions
- `cron_jobs` - Cron job definitions
- `cron_executions` - Execution history
- `audit_logs` - Security audit trail
- `schedule_changes` - Schedule modification history

## Development

```bash
# Run in development mode with hot reload
pnpm start:dev

# Run Prisma Studio (database GUI)
pnpm prisma:studio

# Run tests
pnpm test

# Lint code
pnpm lint
```

## Security Considerations

- Change all default secrets in production
- Use HTTPS in production
- Implement IP whitelisting for API tokens if needed
- Regularly rotate API tokens
- Monitor audit logs for suspicious activity
- Set appropriate rate limits

## License

ISC

## Support

For issues and feature requests, please open an issue on the repository.

