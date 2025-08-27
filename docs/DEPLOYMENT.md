# TalentRadar Deployment Guide

## Overview

TalentRadar supports multiple deployment strategies depending on your needs and scale requirements. This guide covers local development, staging, and production deployments.

## Deployment Options

### 1. Local Development (Docker Compose)
- **Best for**: Development and testing
- **Requirements**: Docker, Docker Compose
- **Cost**: Free
- **Complexity**: Low

### 2. Railway (Recommended)
- **Best for**: MVP and small scale production
- **Requirements**: GitHub repository
- **Cost**: $5/month for hobby plan
- **Complexity**: Low

### 3. Fly.io
- **Best for**: Global deployment with edge computing
- **Requirements**: Fly.io account
- **Cost**: Pay-as-you-use
- **Complexity**: Medium

### 4. AWS/GCP/Azure
- **Best for**: Enterprise scale
- **Requirements**: Cloud provider account
- **Cost**: Variable
- **Complexity**: High

## Local Development Setup

### Prerequisites

```bash
# Required software
- Docker Desktop
- Node.js 18+
- Git

# Optional for database management
- pgAdmin or similar PostgreSQL client
- Redis CLI
```

### Quick Start

1. **Clone and Setup**
```bash
git clone <repository-url>
cd talent-radar
cp .env.example .env
# Edit .env with your configuration
```

2. **Start with Docker Compose**
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

3. **Alternative: Local Development**
```bash
# Install dependencies
npm install

# Start database services only
docker-compose up -d postgres redis

# Run migrations
npm run db:migrate

# Start development servers
npm run dev
```

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: talent_radar
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: ./docker/api/Dockerfile
      target: development
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:password@postgres:5432/talent_radar
      REDIS_URL: redis://redis:6379
    ports:
      - "3001:3001"
    volumes:
      - ./apps/api/src:/app/src
      - ./packages:/app/packages
    depends_on:
      - postgres
      - redis
    command: npm run start:dev

  web:
    build:
      context: .
      dockerfile: ./docker/web/Dockerfile
      target: development
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:3001
    ports:
      - "3000:3000"
    volumes:
      - ./apps/web:/app
      - ./packages:/app/packages
    depends_on:
      - api
    command: npm run dev

  scraper:
    build:
      context: .
      dockerfile: ./docker/api/Dockerfile
      target: development
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:password@postgres:5432/talent_radar
      REDIS_URL: redis://redis:6379
      SCRAPER_MODE: true
    depends_on:
      - postgres
      - redis
    command: npm run start:scraper

volumes:
  postgres_data:
  redis_data:
```

## Railway Deployment (Recommended)

### Why Railway?
- Zero-config deployments
- Automatic HTTPS and custom domains
- Built-in PostgreSQL and Redis
- GitHub integration
- Reasonable pricing for MVP

### Setup Steps

1. **Prepare Repository**
```bash
# Add railway.json configuration
cat > railway.json << EOF
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE"
  }
}
EOF
```

2. **Add Dockerfiles**
```dockerfile
# docker/api/Dockerfile
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
RUN npm ci --only=production

FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

FROM base AS production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "run", "start:prod"]
```

3. **Deploy to Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway add # Add PostgreSQL and Redis services
railway deploy
```

4. **Environment Variables**
```bash
# Set via Railway dashboard or CLI
railway variables set DATABASE_URL=<railway-postgres-url>
railway variables set REDIS_URL=<railway-redis-url>
railway variables set OPENROUTER_API_KEY=<your-key>
railway variables set NODE_ENV=production
```

### Railway Configuration

```json
{
  "environments": {
    "production": {
      "variables": {
        "NODE_ENV": "production",
        "PORT": "3001"
      },
      "plugins": [
        {
          "name": "postgresql",
          "plan": "hobby"
        },
        {
          "name": "redis",
          "plan": "hobby"
        }
      ]
    }
  },
  "services": [
    {
      "name": "api",
      "source": {
        "type": "git",
        "path": "./apps/api"
      },
      "variables": {
        "START_COMMAND": "npm run start:prod"
      }
    },
    {
      "name": "web",
      "source": {
        "type": "git",
        "path": "./apps/web"
      },
      "variables": {
        "NEXT_PUBLIC_API_URL": "${{api.RAILWAY_PUBLIC_DOMAIN}}"
      }
    },
    {
      "name": "worker",
      "source": {
        "type": "git",
        "path": "./apps/api"
      },
      "variables": {
        "START_COMMAND": "npm run start:worker"
      }
    }
  ]
}
```

## Fly.io Deployment

### Setup Steps

1. **Install Fly CLI**
```bash
# macOS
brew install flyctl

# Other platforms
curl -L https://fly.io/install.sh | sh
```

2. **Initialize Fly App**
```bash
fly auth login
fly launch --no-deploy
```

3. **Configure fly.toml**
```toml
# fly.toml
app = "talent-radar"
primary_region = "dfw"

[build]
  dockerfile = "Dockerfile.production"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80
    force_https = true

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[deploy]
  release_command = "npm run db:migrate"

[[mounts]]
  source = "data"
  destination = "/data"
```

4. **Add Database**
```bash
# PostgreSQL
fly postgres create --name talent-radar-db

# Redis
fly redis create --name talent-radar-redis

# Attach to app
fly postgres attach talent-radar-db
fly redis attach talent-radar-redis
```

5. **Deploy**
```bash
fly deploy
```

## Production Considerations

### Environment Variables

Create environment-specific configuration:

```bash
# .env.production
NODE_ENV=production
DATABASE_URL=<production-database-url>
REDIS_URL=<production-redis-url>
OPENROUTER_API_KEY=<your-api-key>

# Security
JWT_SECRET=<random-string>
CORS_ORIGIN=https://yourdomain.com

# AI Configuration
AI_RATE_LIMIT=10
AI_TIMEOUT=30000

# Scraping Configuration
SCRAPER_CONCURRENCY=5
SCRAPER_RATE_LIMIT=1000

# Email (optional)
SMTP_HOST=<smtp-server>
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<password>

# Monitoring
SENTRY_DSN=<sentry-dsn>
LOG_LEVEL=info
```

### Database Configuration

#### PostgreSQL Production Settings

```sql
-- Connection pooling
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '4MB';

-- Logging
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_statement = 'mod';

-- Performance
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';

SELECT pg_reload_conf();
```

#### Redis Production Settings

```bash
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Security Checklist

- [ ] Enable HTTPS/TLS
- [ ] Set secure environment variables
- [ ] Configure CORS properly
- [ ] Implement rate limiting
- [ ] Enable request logging
- [ ] Set up monitoring and alerts
- [ ] Regular security updates
- [ ] Database connection encryption
- [ ] API key rotation schedule

### Performance Optimization

#### Application Level
```typescript
// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import compression from 'compression';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Security
  app.use(helmet());
  
  // Compression
  app.use(compression());
  
  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  });
  
  await app.listen(process.env.PORT || 3001);
}
bootstrap();
```

#### Database Optimization
```sql
-- Create indexes for common queries
CREATE INDEX CONCURRENTLY idx_vacancies_search 
ON vacancies USING GIN(to_tsvector('english', title || ' ' || description));

CREATE INDEX CONCURRENTLY idx_vacancies_location_tech 
ON vacancies(location, tech_stack) WHERE status = 'active';

-- Analyze table statistics
ANALYZE vacancies;
ANALYZE companies;
ANALYZE applications;
```

### Monitoring and Logging

#### Health Checks
```typescript
// apps/api/src/health/health.controller.ts
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok', // Check database connection
        redis: 'ok',    // Check Redis connection
        ai: 'ok',       // Check AI service
      },
    };
  }
}
```

#### Logging Configuration
```typescript
// apps/api/src/config/logger.config.ts
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const loggerConfig = WinstonModule.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
  ],
});
```

### Backup Strategy

#### Database Backups
```bash
#!/bin/bash
# scripts/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_NAME="talent_radar"

# Create backup
pg_dump $DATABASE_URL > "$BACKUP_DIR/backup_$DATE.sql"

# Compress backup
gzip "$BACKUP_DIR/backup_$DATE.sql"

# Upload to cloud storage (optional)
aws s3 cp "$BACKUP_DIR/backup_$DATE.sql.gz" s3://talent-radar-backups/

# Clean old backups (keep last 30 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

#### Automated Backup Schedule
```yaml
# .github/workflows/backup.yml
name: Database Backup

on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Backup Database
        run: |
          pg_dump ${{ secrets.DATABASE_URL }} | gzip > backup.sql.gz
          
      - name: Upload to S3
        run: |
          aws s3 cp backup.sql.gz s3://talent-radar-backups/$(date +%Y%m%d_%H%M%S).sql.gz
```

### Scaling Considerations

#### Horizontal Scaling
```yaml
# docker-compose.scale.yml
version: '3.8'
services:
  api:
    scale: 3
  
  worker:
    scale: 5
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - api
```

#### Load Balancing Configuration
```nginx
# nginx.conf
upstream api_servers {
    server api_1:3001;
    server api_2:3001;
    server api_3:3001;
}

server {
    listen 80;
    server_name api.talentradar.app;
    
    location / {
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Troubleshooting

#### Common Issues

1. **Database Connection Issues**
```bash
# Check connection
psql $DATABASE_URL -c "SELECT version();"

# Check connection pool
SELECT * FROM pg_stat_activity;
```

2. **Memory Issues**
```bash
# Monitor memory usage
docker stats

# Check Node.js memory
node --max-old-space-size=512 app.js
```

3. **Performance Problems**
```sql
-- Identify slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

#### Log Analysis
```bash
# Parse application logs
grep "ERROR" logs/combined.log | tail -20

# Monitor response times
grep "Response time" logs/combined.log | awk '{print $NF}' | sort -n
```

## Cost Optimization

### Development
- Use local Docker for development
- Railway hobby plan: $5/month
- Free tier usage for AI services

### Production
- Railway Pro: $20/month (recommended for MVP)
- Fly.io: $10-50/month depending on usage
- Self-hosted: $10-20/month VPS + database costs

### Scaling Costs
- Monitor AI API usage costs
- Implement caching to reduce database queries
- Use CDN for static assets
- Optimize scraping frequency based on need