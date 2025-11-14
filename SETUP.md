# Quick Start Guide

## Prerequisites

- **Node.js** 18+ or 20+ ([Download](https://nodejs.org/))
- **PostgreSQL** 14+ or MySQL 8+ ([Download PostgreSQL](https://www.postgresql.org/download/))
- **pnpm** (recommended) or npm

## Installation Steps

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory by copying the example:

```bash
# Copy the example file
cp .env.example .env

# Or create it manually with the contents from .env.example
```

**Important:** Edit the `.env` file and update the following values:

- `DATABASE_URL` - Your PostgreSQL connection string
- `JWT_SECRET` - Generate a secure random string (min 32 characters)
- `JWT_REFRESH_SECRET` - Generate another secure random string (min 32 characters)

**Generate secure secrets:**
```bash
# Using OpenSSL
openssl rand -base64 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Set Up Database

```bash
# Generate Prisma Client
pnpm prisma:generate

# Create and run database migrations
pnpm prisma:migrate

# (Optional) Open Prisma Studio to view/edit database
pnpm prisma:studio
```

When running `prisma:migrate`, it will prompt you to:
1. Enter a migration name (e.g., "init")
2. Create the database if it doesn't exist

### 4. Build TailwindCSS (Required for frontend)

```bash
# Build CSS files (run this once)
pnpm css:build

# Or use watch mode for development (automatically rebuilds on changes)
pnpm css:watch
```

**Note:** Make sure `output.css` exists in `public/css/` before starting the server. If you see unstyled pages, run `pnpm css:build` first.

### 5. Start the Application

**Development mode (with hot reload):**
```bash
pnpm start:dev
```

**Production mode:**
```bash
# Build the application first
pnpm build

# Then start
pnpm start:prod
```

The application will be available at: **http://localhost:3000**

## Quick Commands Reference

```bash
# Install dependencies
pnpm install

# Generate Prisma Client
pnpm prisma:generate

# Run database migrations
pnpm prisma:migrate

# Open Prisma Studio (database GUI)
pnpm prisma:studio

# Build CSS (TailwindCSS)
pnpm css:build

# Watch CSS for changes (development)
pnpm css:watch

# Start development server
pnpm start:dev

# Build for production
pnpm build

# Start production server
pnpm start:prod

# Run tests
pnpm test

# Lint code
pnpm lint
```

## First Steps After Starting

1. **Register a user:**
   ```bash
   curl -X POST http://localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"your-password","role":"ADMIN"}'
   ```

2. **Login to get JWT token:**
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"your-password"}'
   ```

3. **Create an API token:**
   ```bash
   curl -X POST http://localhost:3000/auth/tokens \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"My API Token","permissions":["READ","WRITE","EXECUTE","ADMIN"]}'
   ```

4. **Access the dashboard:**
   - Open http://localhost:3000 in your browser
   - Enter your API token when prompted

## Troubleshooting

### Database Connection Issues

If you get database connection errors:

1. **Check PostgreSQL is running:**
   ```bash
   # Windows
   Get-Service postgresql*
   
   # Linux/Mac
   sudo systemctl status postgresql
   ```

2. **Verify DATABASE_URL in .env:**
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/cron_manager?schema=public"
   ```

3. **Create database manually if needed:**
   ```bash
   # Connect to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE cron_manager;
   
   # Exit
   \q
   ```

### Port Already in Use

If port 3000 is already in use:

1. Change `PORT` in `.env` file to another port (e.g., `3001`)
2. Restart the application

### Prisma Client Not Generated

If you see "PrismaClient is not generated" error:

```bash
pnpm prisma:generate
```

### CSS Not Loading

Make sure `public/css/output.css` exists. If not:

```bash
npx tailwindcss -i ./public/css/input.css -o ./public/css/output.css
```

## Environment Variables Summary

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ Yes | - | PostgreSQL connection string |
| `JWT_SECRET` | ✅ Yes | - | Secret for JWT signing |
| `JWT_REFRESH_SECRET` | ✅ Yes | - | Secret for refresh tokens |
| `JWT_EXPIRES_IN` | No | `15m` | Access token expiration |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiration |
| `PORT` | No | `3000` | Server port |
| `API_RATE_LIMIT` | No | `100` | Requests per minute per token |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `AUTO_RESCHEDULING_ENABLED` | No | `true` | Enable auto-rescheduling |
| `LOG_LEVEL` | No | `info` | Logging level |

## Next Steps

- Read the [README.md](README.md) for detailed API documentation
- Explore the API endpoints using the dashboard at http://localhost:3000
- Check [implementation.md](implementation.md) for architecture details

