# Simple AWS Deployment Guide

This is a simple, straightforward guide to deploy the Cron Manager on AWS.

## Quick Deploy: AWS ECS Fargate

### Step 1: Create RDS Database (5 minutes)

1. Go to AWS Console → RDS → Create Database
2. Choose: PostgreSQL
3. Settings:
   - DB instance: `cron-manager-db`
   - Master username: `postgres`
   - Master password: `your-secure-password`
   - DB instance class: `db.t3.micro` (free tier) or `db.t3.small`
   - Storage: 20 GB
4. Click "Create database"
5. Wait for it to be available (5-10 minutes)
6. Copy the endpoint (e.g., `cron-manager-db.xxxxx.us-east-1.rds.amazonaws.com`)

### Step 2: Create ECR Repository (2 minutes)

1. Go to AWS Console → ECR → Create repository
2. Name: `cron-manager`
3. Click "Create repository"
4. Copy the repository URI

### Step 3: Build and Push Docker Image (5 minutes)

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t cron-manager .

# Tag image
docker tag cron-manager:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cron-manager:latest

# Push image
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cron-manager:latest
```

Replace `YOUR_ACCOUNT_ID` with your AWS account ID.

### Step 4: Store Secrets in AWS Secrets Manager (3 minutes)

```bash
# Store database URL
aws secretsmanager create-secret \
  --name cron-manager/database \
  --secret-string "postgresql://postgres:your-password@cron-manager-db.xxxxx.us-east-1.rds.amazonaws.com:5432/cron_manager?schema=public"

# Store JWT secrets
aws secretsmanager create-secret \
  --name cron-manager/jwt \
  --secret-string '{"JWT_SECRET":"your-jwt-secret","JWT_REFRESH_SECRET":"your-refresh-secret","TOKEN_SALT":"your-token-salt"}'
```

### Step 5: Create ECS Cluster (2 minutes)

1. Go to AWS Console → ECS → Clusters → Create Cluster
2. Choose: AWS Fargate
3. Name: `cron-manager-cluster`
4. Click "Create"

### Step 6: Create Task Definition (5 minutes)

1. Go to ECS → Task Definitions → Create new Task Definition
2. Choose: Fargate
3. Settings:
   - Task definition name: `cron-manager`
   - Task size: 0.5 vCPU, 1 GB memory (or 1 vCPU, 2 GB for production)
   - Task execution role: Create new role (auto-creates)
   - Task role: Create new role (auto-creates)
4. Container:
   - Container name: `cron-manager`
   - Image: `YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cron-manager:latest`
   - Port mappings: 3000
   - Environment variables:
     - `NODE_ENV`: `production`
     - `PORT`: `3000`
     - `MAX_CONCURRENT_EXECUTIONS`: `10`
   - Secrets:
     - `DATABASE_URL`: `cron-manager/database` (from Secrets Manager)
     - `JWT_SECRET`: `cron-manager/jwt::JWT_SECRET::`
     - `JWT_REFRESH_SECRET`: `cron-manager/jwt::JWT_REFRESH_SECRET::`
     - `TOKEN_SALT`: `cron-manager/jwt::TOKEN_SALT::`
   - Health check:
     - Command: `CMD-SHELL,node -e "require('http').get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)})"`
     - Interval: 30
     - Timeout: 5
     - Start period: 60
5. Click "Create"

### Step 7: Create Load Balancer (5 minutes)

1. Go to EC2 → Load Balancers → Create Load Balancer
2. Choose: Application Load Balancer
3. Settings:
   - Name: `cron-manager-alb`
   - Scheme: Internet-facing
   - IP address type: IPv4
   - VPC: Select your VPC
   - Availability Zones: Select 2 subnets (public)
4. Security group: Create new (allow HTTPS 443, HTTP 80)
5. Listeners: HTTP 80 (we'll add HTTPS later)
6. Target group:
   - Name: `cron-manager-tg`
   - Target type: IP
   - Protocol: HTTP
   - Port: 3000
   - Health check path: `/health`
7. Click "Create"

### Step 8: Run Database Migrations (3 minutes)

```bash
# Run migration task
aws ecs run-task \
  --cluster cron-manager-cluster \
  --task-definition cron-manager:1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "cron-manager",
      "command": ["sh", "-c", "prisma migrate deploy"]
    }]
  }'
```

Wait for task to complete (check in ECS console).

### Step 9: Create ECS Service (5 minutes)

1. Go to ECS → Clusters → cron-manager-cluster → Services → Create
2. Settings:
   - Launch type: Fargate
   - Task definition: `cron-manager:1`
   - Service name: `cron-manager-service`
   - Number of tasks: 1 (or 2 for high availability)
   - VPC: Select your VPC
   - Subnets: Select private subnets (or public if no NAT gateway)
   - Security group: Create new (allow port 3000 from ALB)
   - Load balancer: Select `cron-manager-alb`
   - Target group: Select `cron-manager-tg`
   - Container: `cron-manager:3000`
3. Click "Create"

### Step 10: Update Security Groups (2 minutes)

1. **RDS Security Group:**
   - Go to RDS → Databases → cron-manager-db → Security
   - Edit inbound rules
   - Add rule: PostgreSQL (5432) from ECS security group

2. **ECS Security Group:**
   - Go to EC2 → Security Groups
   - Find ECS security group
   - Edit inbound rules
   - Add rule: HTTP (3000) from ALB security group

### Step 11: Access Your Application

1. Go to EC2 → Load Balancers → cron-manager-alb
2. Copy the DNS name (e.g., `cron-manager-alb-xxxxx.us-east-1.elb.amazonaws.com`)
3. Access: `http://DNS-NAME`

### Step 12: Add HTTPS (Optional - 5 minutes)

1. Go to AWS Certificate Manager → Request certificate
2. Domain: Your domain (e.g., `cron.yourdomain.com`)
3. Validation: DNS validation
4. Go to EC2 → Load Balancers → cron-manager-alb → Listeners
5. Add listener: HTTPS (443)
6. Default action: Forward to `cron-manager-tg`
7. Certificate: Select your certificate

## That's It!

Your application should now be running on AWS.

## Quick Commands

```bash
# View logs
aws logs tail /ecs/cron-manager --follow

# Update service (after pushing new image)
aws ecs update-service --cluster cron-manager-cluster --service cron-manager-service --force-new-deployment

# Scale service
aws ecs update-service --cluster cron-manager-cluster --service cron-manager-service --desired-count 2
```

## Troubleshooting

**Application won't start?**
- Check CloudWatch logs: `/ecs/cron-manager`
- Verify secrets are accessible
- Check security groups allow traffic

**Database connection error?**
- Verify RDS security group allows ECS security group
- Check DATABASE_URL in Secrets Manager is correct

**Health check failing?**
- Check application logs
- Verify `/health` endpoint works
- Check security groups

## Cost Estimate

- RDS db.t3.micro: ~$15/month
- ECS Fargate (1 task): ~$10/month
- ALB: ~$16/month
- Data transfer: ~$5/month
- **Total: ~$46/month**

Use smaller instances and spot instances to reduce costs.

## Next Steps

1. Set up auto-scaling (optional)
2. Add CloudWatch alarms (optional)
3. Set up CI/CD with GitHub Actions (optional)
4. Add custom domain with Route 53 (optional)

## Need Help?

- Check AWS ECS documentation
- Check CloudWatch logs
- Verify security groups
- Check task definition settings
