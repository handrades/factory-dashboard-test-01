# Multi-stage build for React app
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Accept build arguments
ARG VITE_INFLUXDB_URL=http://influxdb:8086
ARG VITE_INFLUXDB_TOKEN=factory-admin-token
ARG VITE_INFLUXDB_ORG=factory-dashboard
ARG VITE_INFLUXDB_BUCKET=factory-data
ARG VITE_DEPLOYMENT_ENV=docker
ARG VITE_DATA_SOURCE=influxdb

# Set environment variables for build
ENV VITE_INFLUXDB_URL=$VITE_INFLUXDB_URL
ENV VITE_INFLUXDB_TOKEN=$VITE_INFLUXDB_TOKEN
ENV VITE_INFLUXDB_ORG=$VITE_INFLUXDB_ORG
ENV VITE_INFLUXDB_BUCKET=$VITE_INFLUXDB_BUCKET
ENV VITE_DEPLOYMENT_ENV=$VITE_DEPLOYMENT_ENV
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY src ./src
COPY public ./public
COPY docker/index.html ./index.html
COPY config ./config
COPY infrastructure ./infrastructure

# Build the application with Docker config
RUN npx vite build --config config/vite.config.docker.ts

# Production stage
FROM nginx:alpine

# Copy built app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration for React Router
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]