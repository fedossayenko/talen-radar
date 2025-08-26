# TalentRadar API Dockerfile

FROM node:22-slim AS base

# Install system dependencies for Playwright and enhanced xvfb support
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg \
    ca-certificates \
    procps \
    xvfb \
    x11-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright system dependencies
RUN npx --yes playwright@1.54.2 install-deps chromium

# Create app directory
WORKDIR /app

# Copy package files for workspace setup
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/*/package*.json ./packages/

# Install dependencies
FROM base AS dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development

# Install all dependencies including dev dependencies
RUN npm ci
RUN npm install -g @nestjs/cli

# Install Playwright browsers
RUN npx playwright install chromium --with-deps

# Copy workspace source code
COPY apps/ ./apps/
COPY packages/ ./packages/

# Copy and setup entrypoint and xvfb wrapper scripts
COPY docker/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY docker/api/xvfb-wrapper.sh /usr/local/bin/xvfb-wrapper.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/xvfb-wrapper.sh

# Setup X11 directories and permissions for Xvfb
RUN mkdir -p /tmp/.X11-unix \
    && chmod 1777 /tmp/.X11-unix \
    && mkdir -p /tmp/logs \
    && chmod 755 /tmp/logs

# Create data directory for SQLite
RUN mkdir -p /app/data && chmod 755 /app/data

# Generate Prisma client during build
WORKDIR /app/apps/api
RUN npx prisma generate

# Back to app root
WORKDIR /app

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start:dev"]

# Build stage
FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build --workspace=apps/api

# Production stage
FROM base AS production

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages ./packages

# Copy built application
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package*.json ./apps/api/

# Create non-root user
RUN groupadd -g 1001 nodejs
RUN useradd -r -u 1001 -g nodejs nextjs

# Change ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "apps/api/dist/main.js"]