FROM node:20-alpine AS builder

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create app directory with restricted permissions
WORKDIR /app

# Copy package files
COPY auth-service/package*.json ./
COPY auth-service/tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install && npm cache clean --force

# Copy source code
COPY auth-service/src/ ./src/

# Skip build for now to get services running quickly
# RUN npm run build
# RUN npm prune --omit=dev

# Production stage
FROM node:20-alpine AS production

# Install security updates and add non-root user
RUN apk update && apk upgrade && apk add --no-cache dumb-init curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S authservice -u 1001 -G nodejs

# Create app directory
WORKDIR /app

# Copy application and dependencies (including src for dev mode)
COPY --from=builder --chown=authservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=authservice:nodejs /app/src ./src
COPY --from=builder --chown=authservice:nodejs /app/package*.json ./
COPY --from=builder --chown=authservice:nodejs /app/tsconfig.json ./

# Create logs directory
RUN mkdir -p /app/logs && chown authservice:nodejs /app/logs

# Switch to non-root user
USER authservice

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application in dev mode
CMD ["npm", "run", "dev"]