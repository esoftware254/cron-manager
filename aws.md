# AWS Deployment Guide for Cron Manager

This guide covers deploying the NestJS Cron Manager application on AWS using ECS (Elastic Container Service), RDS (Relational Database Service), and other AWS services.

## Quick Start

For a quick deployment, follow these essential steps:

1. **Prerequisites**: AWS CLI installed, Docker installed, AWS account with appropriate permissions
2. **Create RDS PostgreSQL**: Set up managed database
3. **Create ECR Repository**: Container registry for Docker images
4. **Build and Push Docker Image**: Package application and push to ECR
5. **Create ECS Cluster and Service**: Deploy application to Fargate
6. **Set Up Load Balancer**: Expose application via ALB
7. **Configure Secrets**: Store sensitive data in AWS Secrets Manager
8. **Run Migrations**: Initialize database schema
9. **Deploy**: Launch application

For detailed instructions, see the sections below.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [AWS Services Required](#aws-services-required)
- [Step 1: Create Docker Image](#step-1-create-docker-image)
- [Step 2: Set Up RDS PostgreSQL Database](#step-2-set-up-rds-postgresql-database)
- [Step 3: Create ECR Repository](#step-3-create-ecr-repository)
- [Step 4: Build and Push Docker Image](#step-4-build-and-push-docker-image)
- [Step 5: Create ECS Cluster and Task Definition](#step-5-create-ecs-cluster-and-task-definition)
- [Step 6: Set Up Application Load Balancer](#step-6-set-up-application-load-balancer)
- [Step 7: Configure Environment Variables](#step-7-configure-environment-variables)
- [Step 8: Run Database Migrations](#step-8-run-database-migrations)
- [Step 9: Deploy Application](#step-9-deploy-application)
- [Step 10: Set Up CI/CD Pipeline](#step-10-set-up-cicd-pipeline)
- [Step 11: Monitoring and Logging](#step-11-monitoring-and-logging)
- [Step 12: Security Best Practices](#step-12-security-best-practices)
- [Scaling Considerations](#scaling-considerations)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

```
┌─────────────────┐
│   Route 53      │ (DNS)
└────────┬────────┘
         │
┌────────▼────────┐
│   CloudFront    │ (CDN - Optional)
└────────┬────────┘
         │
┌────────▼────────┐
│   ALB (HTTPS)   │ (Application Load Balancer)
└────────┬────────┘
         │
┌────────▼──────────────────────────────┐
│         ECS Fargate                   │
│  ┌──────────────┐  ┌──────────────┐  │
│  │   Task 1     │  │   Task 2     │  │
│  │  Cron Manager│  │  Cron Manager│  │
│  └──────────────┘  └──────────────┘  │
└────────┬──────────────────────────────┘
         │
┌────────▼────────┐
│   RDS PostgreSQL│ (Database)
└─────────────────┘
```

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI installed and configured
- Docker installed locally
- Node.js 18+ and pnpm/npm installed
- Domain name (optional, for custom domain)

## AWS Services Required

- **ECS (Fargate)** - Container orchestration
- **ECR** - Docker container registry
- **RDS PostgreSQL** - Managed database
- **Application Load Balancer (ALB)** - Load balancing and HTTPS
- **Route 53** - DNS (optional)
- **CloudFront** - CDN (optional)
- **AWS Secrets Manager** - Secrets management
- **CloudWatch** - Logging and monitoring
- **IAM** - Access control
- **VPC** - Network isolation
- **EC2** - For migration tasks (optional)

## Step 1: Create Docker Image

### 1.1 Create Dockerfile

Create a `Dockerfile` in the root directory:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Generate Prisma Client
RUN pnpm prisma:generate

# Copy source code
COPY . .

# Build application
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Generate Prisma Client for production
RUN pnpm prisma:generate

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Change ownership
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/main.js"]
```

### 1.2 Create .dockerignore

Create a `.dockerignore` file:

```
node_modules
dist
.env
.env.*
.git
.gitignore
README.md
.vscode
.idea
*.log
coverage
.DS_Store
```

### 1.3 Add Health Check Endpoint

Create `src/app.controller.ts` (if not exists) or update it:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

## Step 2: Set Up RDS PostgreSQL Database

### 2.1 Create RDS PostgreSQL Instance

Using AWS Console or CLI:

```bash
# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier cron-manager-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15.4 \
  --master-username postgres \
  --master-user-password YOUR_SECURE_PASSWORD \
  --allocated-storage 20 \
  --storage-type gp3 \
  --vpc-security-group-ids sg-xxxxxxxxx \
  --db-subnet-group-name cron-manager-subnet-group \
  --backup-retention-period 7 \
  --multi-az \
  --publicly-accessible false \
  --storage-encrypted \
  --enable-performance-insights
```

### 2.2 Create Database and User

Connect to RDS and create database:

```sql
CREATE DATABASE cron_manager;
CREATE USER cron_manager_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE cron_manager TO cron_manager_user;
```

### 2.3 Store Database Credentials in AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name cron-manager/database \
  --secret-string '{
    "username": "cron_manager_user",
    "password": "secure_password",
    "host": "cron-manager-db.xxxxx.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "database": "cron_manager"
  }'
```

## Step 3: Create ECR Repository

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name cron-manager \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# Get repository URI
aws ecr describe-repositories --repository-names cron-manager
```

## Step 4: Build and Push Docker Image

### 4.1 Authenticate Docker with ECR

```bash
# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
```

### 4.2 Build and Push Image

```bash
# Build image
docker build -t cron-manager .

# Tag image
docker tag cron-manager:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cron-manager:latest

# Push image
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cron-manager:latest
```

## Step 5: Create ECS Cluster and Task Definition

### 5.1 Create ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name cron-manager-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
```

### 5.2 Create Task Definition

Create `task-definition.json`:

```json
{
  "family": "cron-manager",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "cron-manager",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cron-manager:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "LOG_LEVEL",
          "value": "info"
        },
        {
          "name": "AUTO_RESCHEDULING_ENABLED",
          "value": "true"
        },
        {
          "name": "MAX_CONCURRENT_EXECUTIONS",
          "value": "20"
        },
        {
          "name": "DATABASE_CONNECTION_LIMIT",
          "value": "40"
        },
        {
          "name": "DATABASE_POOL_TIMEOUT",
          "value": "20"
        },
        {
          "name": "RESCHEDULING_BATCH_SIZE",
          "value": "50"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:cron-manager/database"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:cron-manager/jwt"
        },
        {
          "name": "JWT_REFRESH_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:cron-manager/jwt"
        },
        {
          "name": "TOKEN_SALT",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:cron-manager/token"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cron-manager",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "node -e \"require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Register task definition:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### 5.3 Create CloudWatch Log Group

```bash
aws logs create-log-group --log-group-name /ecs/cron-manager
```

## Step 6: Set Up Application Load Balancer

### 6.1 Create Target Group

```bash
aws elbv2 create-target-group \
  --name cron-manager-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxxxxxx \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

### 6.2 Create Application Load Balancer

```bash
aws elbv2 create-load-balancer \
  --name cron-manager-alb \
  --subnets subnet-xxxxxxxxx subnet-yyyyyyyyy \
  --security-groups sg-xxxxxxxxx \
  --scheme internet-facing \
  --type application
```

### 6.3 Create HTTPS Listener (with ACM Certificate)

```bash
# First, create ACM certificate (in us-east-1 for ALB)
aws acm request-certificate \
  --domain-name yourdomain.com \
  --validation-method DNS \
  --region us-east-1

# Create HTTPS listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:ACCOUNT_ID:loadbalancer/app/cron-manager-alb/xxxxx \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/xxxxx \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:ACCOUNT_ID:targetgroup/cron-manager-tg/xxxxx
```

## Step 7: Configure Environment Variables

### 7.1 Store Secrets in AWS Secrets Manager

```bash
# JWT Secrets
aws secretsmanager create-secret \
  --name cron-manager/jwt \
  --secret-string '{
    "JWT_SECRET": "your-jwt-secret-change-in-production",
    "JWT_REFRESH_SECRET": "your-refresh-secret-change-in-production",
    "JWT_EXPIRES_IN": "15m",
    "JWT_REFRESH_EXPIRES_IN": "7d"
  }'

# Token Salt
aws secretsmanager create-secret \
  --name cron-manager/token \
  --secret-string '{
    "TOKEN_SALT": "your-token-salt-change-in-production"
  }'
```

### 7.2 Update DATABASE_URL in Secrets Manager

Update the database secret to include full connection string:

```json
{
  "DATABASE_URL": "postgresql://cron_manager_user:password@cron-manager-db.xxxxx.us-east-1.rds.amazonaws.com:5432/cron_manager?schema=public&connection_limit=40&pool_timeout=20"
}
```

## Step 8: Run Database Migrations

### 8.1 Create Migration Task

Create a separate ECS task definition for migrations:

```json
{
  "family": "cron-manager-migration",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "migration",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cron-manager:latest",
      "command": ["sh", "-c", "pnpm prisma migrate deploy"],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:cron-manager/database"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cron-manager-migration",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "migration"
        }
      }
    }
  ]
}
```

### 8.2 Run Migration

```bash
# Register migration task definition
aws ecs register-task-definition --cli-input-json file://migration-task-definition.json

# Run migration task
aws ecs run-task \
  --cluster cron-manager-cluster \
  --task-definition cron-manager-migration \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}"
```

## Step 9: Deploy Application

### 9.1 Create ECS Service

```bash
aws ecs create-service \
  --cluster cron-manager-cluster \
  --service-name cron-manager-service \
  --task-definition cron-manager:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:ACCOUNT_ID:targetgroup/cron-manager-tg/xxxxx,containerName=cron-manager,containerPort=3000 \
  --health-check-grace-period-seconds 60 \
  --enable-execute-command
```

### 9.2 Update Service

```bash
# Update service with new task definition
aws ecs update-service \
  --cluster cron-manager-cluster \
  --service cron-manager-service \
  --task-definition cron-manager:2 \
  --force-new-deployment
```

## Step 10: Set Up CI/CD Pipeline

### 10.1 Create GitHub Actions Workflow

Create `.github/workflows/deploy-aws.yml`:

```yaml
name: Deploy to AWS ECS

on:
  push:
    branches:
      - main

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: cron-manager
  ECS_SERVICE: cron-manager-service
  ECS_CLUSTER: cron-manager-cluster
  ECS_TASK_DEFINITION: cron-manager

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest

    steps:
    - name: Checkout
      uses: actions/checkout@v3

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1

    - name: Build, tag, and push image to Amazon ECR
      id: build-image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

    - name: Download task definition
      run: |
        aws ecs describe-task-definition \
          --task-definition ${{ env.ECS_TASK_DEFINITION }} \
          --query taskDefinition > task-definition.json

    - name: Fill in the new image ID in the Amazon ECS task definition
      id: task-def
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-definition.json
        container-name: cron-manager
        image: ${{ steps.build-image.outputs.image }}

    - name: Deploy Amazon ECS task definition
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ${{ steps.task-def.outputs.task-definition }}
        service: ${{ env.ECS_SERVICE }}
        cluster: ${{ env.ECS_CLUSTER }}
        wait-for-service-stability: true
```

### 10.2 Set Up GitHub Secrets

In GitHub repository settings, add:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## Step 11: Monitoring and Logging

### 11.1 CloudWatch Logs

Logs are automatically sent to CloudWatch via the task definition log configuration.

### 11.2 CloudWatch Alarms

Create alarms for:
- High CPU utilization
- High memory utilization
- Unhealthy target count
- Database connection pool exhaustion

```bash
# CPU Alarm
aws cloudwatch put-metric-alarm \
  --alarm-name cron-manager-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

### 11.3 AWS X-Ray (Optional)

Enable X-Ray for distributed tracing:

```bash
# Add X-Ray daemon sidecar to task definition
```

## Step 12: Security Best Practices

### 12.1 Create IAM Roles

#### 12.1.1 Create ECS Task Execution Role

This role allows ECS to pull images from ECR and write logs to CloudWatch:

```bash
# Create execution role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach managed policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Create custom policy for Secrets Manager access
aws iam put-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-name SecretsManagerAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": ["arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:cron-manager/*"]
    }]
  }'
```

#### 12.1.2 Create ECS Task Role

This role allows the application to access AWS services:

```bash
# Create task role
aws iam create-role \
  --role-name ecsTaskRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Create policy for application access
aws iam put-role-policy \
  --role-name ecsTaskRole \
  --policy-name ApplicationAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["secretsmanager:GetSecretValue"],
        "Resource": ["arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:cron-manager/*"]
      },
      {
        "Effect": "Allow",
        "Action": [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        "Resource": [
          "arn:aws:logs:us-east-1:ACCOUNT_ID:log-group:/ecs/cron-manager:*",
          "arn:aws:logs:us-east-1:ACCOUNT_ID:log-group:/ecs/cron-manager-migration:*"
        ]
      }
    ]
  }'
```

### 12.2 VPC Configuration

- Place ECS tasks in private subnets
- Use NAT Gateway for outbound internet access
- Restrict RDS to private subnets only
- Use security groups to restrict traffic
- Create VPC endpoints for AWS services (optional, reduces NAT Gateway costs)

### 12.3 Security Groups

#### 12.3.1 ALB Security Group

```bash
# Create ALB security group
aws ec2 create-security-group \
  --group-name cron-manager-alb-sg \
  --description "Security group for Cron Manager ALB" \
  --vpc-id vpc-xxxxxxxxx

# Allow HTTPS from internet
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

#### 12.3.2 ECS Security Group

```bash
# Create ECS security group
aws ec2 create-security-group \
  --group-name cron-manager-ecs-sg \
  --description "Security group for Cron Manager ECS tasks" \
  --vpc-id vpc-xxxxxxxxx

# Allow HTTP from ALB security group only
aws ec2 authorize-security-group-ingress \
  --group-id sg-yyyyyyyyy \
  --protocol tcp \
  --port 3000 \
  --source-group sg-xxxxxxxxx
```

#### 12.3.3 RDS Security Group

```bash
# Create RDS security group
aws ec2 create-security-group \
  --group-name cron-manager-rds-sg \
  --description "Security group for Cron Manager RDS" \
  --vpc-id vpc-xxxxxxxxx

# Allow PostgreSQL from ECS security group only
aws ec2 authorize-security-group-ingress \
  --group-id sg-zzzzzzzzz \
  --protocol tcp \
  --port 5432 \
  --source-group sg-yyyyyyyyy
```

### 12.4 Enable WAF (Optional)

```bash
aws wafv2 create-web-acl \
  --name cron-manager-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules file://waf-rules.json
```

## Scaling Considerations

### Horizontal Scaling

```bash
# Auto-scaling configuration
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/cron-manager-cluster/cron-manager-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/cron-manager-cluster/cron-manager-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    }
  }'
```

### Database Scaling

- Use RDS Read Replicas for read-heavy workloads
- Enable Performance Insights
- Monitor connection pool usage
- Adjust `DATABASE_CONNECTION_LIMIT` based on task count

### Performance Tuning

For 200+ cron jobs:
- Set `MAX_CONCURRENT_EXECUTIONS=20-50` (depending on task CPU/memory)
- Set `DATABASE_CONNECTION_LIMIT=40-100` (2x MAX_CONCURRENT_EXECUTIONS)
- Use larger ECS task sizes (2 vCPU, 4GB RAM) for high loads
- Enable Fargate Spot for cost optimization (50% savings)

## Troubleshooting

### Common Issues

1. **Task fails to start**
   - Check CloudWatch logs
   - Verify secrets are accessible
   - Check security group rules
   - Verify database connectivity

2. **Database connection errors**
   - Verify RDS security group allows ECS security group
   - Check DATABASE_URL format
   - Verify connection pool limits

3. **High memory usage**
   - Increase task memory
   - Reduce `MAX_CONCURRENT_EXECUTIONS`
   - Enable container insights

4. **Slow job execution**
   - Check database performance
   - Monitor connection pool usage
   - Verify HTTP connection pooling
   - Check target endpoint response times

### Useful Commands

```bash
# View service logs
aws logs tail /ecs/cron-manager --follow

# Check service status
aws ecs describe-services --cluster cron-manager-cluster --services cron-manager-service

# Execute command in running container
aws ecs execute-command \
  --cluster cron-manager-cluster \
  --task TASK_ID \
  --container cron-manager \
  --command "/bin/sh" \
  --interactive

# Check task definition
aws ecs describe-task-definition --task-definition cron-manager
```

## Cost Optimization

- Use Fargate Spot for non-critical tasks (50% savings)
- Use Reserved Capacity for RDS (30-40% savings)
- Enable auto-scaling to scale down during low usage
- Use CloudWatch Logs retention policies
- Enable RDS automated backups with appropriate retention

## Next Steps

1. Set up custom domain with Route 53
2. Configure CloudFront CDN for static assets
3. Set up AWS WAF for additional security
4. Configure backup and disaster recovery
5. Set up monitoring dashboards
6. Configure alerting for critical metrics

## Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS RDS Documentation](https://docs.aws.amazon.com/rds/)
- [NestJS Deployment Guide](https://docs.nestjs.com/recipes/deployment)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)

