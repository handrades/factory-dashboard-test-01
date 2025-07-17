# Factory Dashboard Deployment Guide

This guide provides comprehensive instructions for deploying the Factory Dashboard system using Docker Compose.

## Architecture Overview

The Factory Dashboard system consists of:

- **Frontend Dashboard**: React application for monitoring factory operations
- **PLC Emulator**: Service that generates realistic equipment data
- **Queue Consumer**: Service that processes messages and writes to InfluxDB
- **Redis**: Message queue for reliable data streaming
- **InfluxDB**: Time series database for storing equipment data
- **Grafana**: Advanced monitoring and visualization platform

## Prerequisites

- Docker 20.10+ 
- Docker Compose 2.0+
- Node.js 18+ (for development)
- 4GB+ RAM available
- 10GB+ disk space

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd factory-dashboard-test-01
   ```

2. **Run the startup script**
   ```bash
   ./scripts/start-factory.sh
   ```

3. **Access the applications**
   - Dashboard: http://localhost:3000
   - Grafana: http://localhost:3001 (admin/factory123)
   - Redis Commander: http://localhost:8082

## Manual Deployment

### Step 1: Environment Configuration

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your configuration:
   ```env
   # Redis Configuration
   REDIS_PASSWORD=your_secure_password
   
   # InfluxDB Configuration
   INFLUXDB_USERNAME=admin
   INFLUXDB_PASSWORD=your_secure_password
   INFLUXDB_ORG=factory-dashboard
   INFLUXDB_BUCKET=factory-data
   INFLUXDB_TOKEN=your_secure_token
   
   # Grafana Configuration
   GRAFANA_PASSWORD=your_secure_password
   ```

### Step 2: Build Services

1. **Build shared types**
   ```bash
   cd services/shared-types
   npm install
   npm run build
   cd ../..
   ```

2. **Build PLC Emulator**
   ```bash
   cd services/plc-emulator
   npm install
   npm run build
   cd ../..
   ```

3. **Build Queue Consumer**
   ```bash
   cd services/queue-consumer
   npm install
   npm run build
   cd ../..
   ```

4. **Build Dashboard**
   ```bash
   npm install
   npm run build
   ```

### Step 3: Deploy with Docker Compose

1. **Start all services**
   ```bash
   docker-compose up -d
   ```

2. **Monitor startup**
   ```bash
   docker-compose logs -f
   ```

3. **Check service health**
   ```bash
   docker-compose ps
   ```

## Service Configuration

### PLC Emulator

The PLC Emulator can be configured via environment variables:

```env
UPDATE_INTERVAL=2000          # Data update interval (ms)
HEARTBEAT_INTERVAL=30000      # Heartbeat interval (ms)
CONFIG_PATH=/app/config/sample-equipment.json
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

### Queue Consumer

```env
CONSUMER_CONCURRENCY=5        # Number of concurrent consumers
CONSUMER_BATCH_SIZE=10        # Messages per batch
WRITE_BATCH_SIZE=100         # InfluxDB write batch size
ENABLE_HEALTH_ENDPOINT=true  # Enable health check endpoint
```

### Dashboard

```env
VITE_INFLUXDB_URL=http://localhost:8086
VITE_INFLUXDB_TOKEN=your_token
VITE_INFLUXDB_ORG=factory-dashboard
VITE_INFLUXDB_BUCKET=factory-data
```

## Monitoring and Troubleshooting

### Health Checks

All services include health checks:

- **Redis**: `docker-compose exec redis redis-cli ping`
- **InfluxDB**: `curl http://localhost:8086/health`
- **Queue Consumer**: `curl http://localhost:8081/health`
- **Dashboard**: `curl http://localhost:3000`

### Common Issues

1. **Services not starting**
   - Check Docker resources (CPU, memory)
   - Verify port availability
   - Review logs: `docker-compose logs [service-name]`

2. **Data not appearing**
   - Check PLC Emulator logs
   - Verify Redis connection
   - Check Queue Consumer processing

3. **Dashboard connection issues**
   - Verify InfluxDB is running
   - Check token configuration
   - Review browser console for errors

### Logs and Debugging

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f plc-emulator
docker-compose logs -f queue-consumer

# Follow logs in real-time
docker-compose logs -f --tail=100
```

## Scaling and Performance

### Horizontal Scaling

1. **Scale Queue Consumers**
   ```bash
   docker-compose up -d --scale queue-consumer=3
   ```

2. **Multiple PLC Emulators**
   ```bash
   docker-compose up -d --scale plc-emulator=2
   ```

### Performance Tuning

1. **Redis Configuration**
   - Increase memory limits
   - Configure persistence settings
   - Optimize connection pooling

2. **InfluxDB Optimization**
   - Adjust retention policies
   - Configure write batch sizes
   - Optimize query performance

3. **Queue Consumer Tuning**
   - Increase concurrency
   - Adjust batch sizes
   - Configure retry policies

## Security Considerations

1. **Change default passwords**
2. **Use secure tokens**
3. **Configure network security**
4. **Enable authentication**
5. **Use HTTPS in production**

## Backup and Recovery

### Database Backup

```bash
# InfluxDB backup
docker-compose exec influxdb influx backup /tmp/backup
docker cp factory-influxdb:/tmp/backup ./backup

# Redis backup
docker-compose exec redis redis-cli BGSAVE
```

### Recovery

```bash
# Restore InfluxDB
docker cp ./backup factory-influxdb:/tmp/backup
docker-compose exec influxdb influx restore /tmp/backup

# Restore Redis
docker cp ./dump.rdb factory-redis:/data/dump.rdb
docker-compose restart redis
```

## Maintenance

### Updates

```bash
# Update services
docker-compose pull
docker-compose up -d

# Rebuild custom images
docker-compose build --no-cache
docker-compose up -d
```

### Cleanup

```bash
# Remove unused containers
docker system prune

# Remove volumes (WARNING: Data loss)
docker-compose down -v
```

## Support and Documentation

- Check service health endpoints
- Review application logs
- Consult Grafana dashboards
- Monitor system resources

For additional support, please refer to the main README.md file.