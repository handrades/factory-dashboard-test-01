# Multi-stage build for Queue Consumer Service
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy shared-types first
COPY shared-types/ /shared-types/
WORKDIR /shared-types
RUN npm install && npm run build

# Switch back to app directory
WORKDIR /app

# Copy package files
COPY queue-consumer/package*.json ./

# Clear npm cache and install dependencies
RUN npm cache clean --force && \
    rm -f package-lock.json && \
    npm install

# Copy source code
COPY queue-consumer/ .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy shared-types for production
COPY --from=builder /shared-types /shared-types

# Copy package files
COPY queue-consumer/package*.json ./

# Install only production dependencies
RUN npm install --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Switch to non-root user
USER nodejs

# Expose health check port
EXPOSE 8080

# Start the application
CMD ["node", "dist/index.js"]