# Factory Dashboard Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Factory Dashboard system in production environments.

## Prerequisites

- Docker and Docker Compose installed
- Minimum 4GB RAM, 2 CPU cores
- 20GB available disk space
- Network access to required ports (3000, 6379, 8086, 8080, 3001)

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dashboard     │    │  PLC Emulator   │    │ Queue Consumer  │
│   (Frontend)    │    │   (Data Gen)    │    │  (Processing)   │
│   Port: 3000    │    │   Port: 3000    │    │   Port: 8080    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │     Redis       │              │
         │              │  (Message Queue)│              │
         │              │   Port: 6379    │              │
         │              └─────────────────┘              │
         │                                               │
         ▼                                               ▼
┌─────────────────┐                            ┌─────────────────┐
│    InfluxDB     │                            │    InfluxDB     │
│   (Time Series  │◄───────────────────────────│   (Time Series  │
│    Database)    │                            │    Database)    │
│   Port: 8086    │                            │   Port: 8086    │
└─────────────────┘                            └─────────────────┘
```

## Deployment Steps

### 1. Environment Setup

#### Production Environment Variables

Create a `.env` file in the project root:

```bash
# Redis Configuration
REDIS_PASSWORD=your_secure_redis_password

# InfluxDB Configuration
INFLUXDB_USERNAME=admin
INFLUXDB_PASSWORD=your_secure_influxdb_password
INFLUXDB_ORG=factory-dashboard
INFLUXDB_BUCKET=factory-data
INFLUXDB_TOKEN=your_secure_influxdb_token

# Grafana Configuration
GRAFANA_PASSWORD=your_secure_grafana_password

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
UPDATE_INTERVAL=5000
HEARTBEAT_INTERVAL=30000
CONSUMER_CONCURRENCY=10
```

#### Security Considerations

1. **Change default passwords** - All default passwords should be changed
2. **Use strong passwords** - Minimum 16 characters with mixed case, numbers, and symbols
3. **Secure token generation** - Use cryptographically secure random tokens
4. **Network security** - Implement proper firewall rules
5. **SSL/TLS** - Use HTTPS in production (configure reverse proxy)

### 2. Deploy with Docker Compose

#### Production Deployment

```bash
# 1. Clone the repository
git clone <repository-url>
cd factory-dashboard

# 2. Create production environment file
cp .env.example .env
# Edit .env with your production values

# 3. Build and start services
docker-compose -f docker-compose.yml up -d

# 4. Verify deployment
docker-compose ps
docker-compose logs -f
```

#### Health Check

```bash
# Check service health
curl http://localhost:3000/health       # Dashboard
curl http://localhost:8080/health       # Queue Consumer
curl http://localhost:6379              # Redis (requires auth)
curl http://localhost:8086/health       # InfluxDB
```

### 3. Configuration Management

#### Production Line Configuration

1. **Equipment Configuration Files**
   - Location: `infrastructure/config/`
   - Files: `line1.json`, `line2.json`, etc.
   - Format: JSON with equipment definitions

2. **PLC Emulator Configuration**
   - Location: `services/plc-emulator/config/`
   - Environment-specific configs in `environments/`

3. **Sample Configuration**

```json
{
  "lineId": "line1",
  "lineName": "Production Line 1",
  "equipment": [
    {
      "id": "line1_oven_01",
      "name": "Industrial Oven 1",
      "type": "oven",
      "position": { "x": 100, "y": 200 },
      "tags": [
        {
          "id": "temperature",
          "name": "Temperature",
          "dataType": "float",
          "unit": "°C",
          "range": { "min": 200, "max": 400 }
        }
      ]
    }
  ]
}
```

### 4. Monitoring and Alerting

#### Grafana Dashboard Setup

1. **Access Grafana**
   - URL: `http://localhost:3001`
   - Username: `admin`
   - Password: Value from `GRAFANA_PASSWORD` environment variable

2. **Import Factory Dashboard**
   - Go to Dashboards → Import
   - Upload `monitoring/grafana/dashboards/factory-overview.json`

3. **Configure Alerts**
   - Edit `monitoring/alerts/alert-rules.yml`
   - Restart Grafana container

#### System Monitoring

```bash
# Monitor container logs
docker-compose logs -f

# Monitor resource usage
docker stats

# Monitor specific service
docker-compose logs -f plc-emulator

# Check service health
./scripts/health-check.sh
```

### 5. Backup and Recovery

#### InfluxDB Backup

```bash
# Create backup
docker exec factory-influxdb influx backup /tmp/backup
docker cp factory-influxdb:/tmp/backup ./backup-$(date +%Y%m%d)

# Restore from backup
docker cp ./backup-20231201 factory-influxdb:/tmp/restore
docker exec factory-influxdb influx restore /tmp/restore
```

#### Redis Backup

```bash
# Create Redis snapshot
docker exec factory-redis redis-cli --rdb /data/dump.rdb
docker cp factory-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb

# Restore Redis data
docker cp ./redis-backup-20231201.rdb factory-redis:/data/dump.rdb
docker-compose restart redis
```

### 6. Scaling and Performance

#### Horizontal Scaling

1. **Multiple Queue Consumers**
```yaml
# docker-compose.yml
queue-consumer-1:
  <<: *queue-consumer
  container_name: factory-queue-consumer-1

queue-consumer-2:
  <<: *queue-consumer
  container_name: factory-queue-consumer-2
```

2. **Load Balancing**
```yaml
nginx:
  image: nginx:alpine
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf
  ports:
    - "80:80"
  depends_on:
    - dashboard
```

#### Performance Tuning

1. **InfluxDB Configuration**
```toml
# influxdb.conf
[http]
  max-concurrent-queries = 100
  max-enqueued-queries = 1000

[data]
  cache-max-memory-size = "1g"
  cache-snapshot-memory-size = "256m"
```

2. **Redis Configuration**
```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
tcp-keepalive 300
```

### 7. Troubleshooting

#### Common Issues

1. **Service Won't Start**
```bash
# Check logs
docker-compose logs service-name

# Check system resources
df -h
free -h
docker system df
```

2. **Database Connection Issues**
```bash
# Test Redis connection
docker exec factory-redis redis-cli -a $REDIS_PASSWORD ping

# Test InfluxDB connection
docker exec factory-influxdb influx ping
```

3. **High Memory Usage**
```bash
# Check container memory usage
docker stats

# Restart services if needed
docker-compose restart service-name
```

#### Performance Issues

1. **Slow Query Performance**
```bash
# Check InfluxDB query performance
docker exec factory-influxdb influx query 'SHOW STATS'

# Monitor Redis performance
docker exec factory-redis redis-cli --latency
```

2. **Message Queue Backlog**
```bash
# Check Redis queue lengths
docker exec factory-redis redis-cli -a $REDIS_PASSWORD INFO replication

# Monitor queue consumer performance
curl http://localhost:8080/metrics
```

### 8. Security Hardening

#### Network Security

1. **Firewall Configuration**
```bash
# Allow only required ports
ufw allow 3000/tcp    # Dashboard
ufw allow 3001/tcp    # Grafana
ufw deny 6379/tcp     # Redis (internal only)
ufw deny 8086/tcp     # InfluxDB (internal only)
```

2. **Docker Network Isolation**
```yaml
# docker-compose.yml
networks:
  factory-network:
    driver: bridge
    internal: true
  public-network:
    driver: bridge
```

#### Authentication and Authorization

1. **Enable Authentication**
```bash
# Redis authentication
AUTH your_redis_password

# InfluxDB token-based authentication
curl -X POST http://localhost:8086/api/v2/authorizations \
  -H "Authorization: Token your_token"
```

2. **SSL/TLS Configuration**
```yaml
# nginx.conf
server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/factory-dashboard.crt;
    ssl_certificate_key /etc/ssl/private/factory-dashboard.key;
}
```

### 9. Maintenance Procedures

#### Regular Maintenance

1. **Daily Tasks**
   - Check service health
   - Monitor resource usage
   - Review error logs

2. **Weekly Tasks**
   - Backup databases
   - Update container images
   - Review security logs

3. **Monthly Tasks**
   - Performance analysis
   - Capacity planning
   - Security audit

#### Update Procedures

1. **Rolling Updates**
```bash
# Update single service
docker-compose pull service-name
docker-compose up -d service-name

# Update all services
docker-compose pull
docker-compose up -d
```

2. **Rollback Procedures**
```bash
# Rollback to previous version
docker-compose down
docker-compose up -d --force-recreate
```

### 10. Disaster Recovery

#### Backup Strategy

1. **Full System Backup**
```bash
#!/bin/bash
# backup-system.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/factory-dashboard-$DATE"

mkdir -p $BACKUP_DIR

# Backup InfluxDB
docker exec factory-influxdb influx backup /tmp/backup
docker cp factory-influxdb:/tmp/backup $BACKUP_DIR/influxdb

# Backup Redis
docker exec factory-redis redis-cli --rdb /data/dump.rdb
docker cp factory-redis:/data/dump.rdb $BACKUP_DIR/redis.rdb

# Backup configurations
cp -r infrastructure/config $BACKUP_DIR/
cp .env $BACKUP_DIR/

# Compress backup
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR
```

2. **Recovery Procedures**
```bash
#!/bin/bash
# restore-system.sh

BACKUP_FILE=$1
RESTORE_DIR="/tmp/restore"

tar -xzf $BACKUP_FILE -C $RESTORE_DIR

# Restore InfluxDB
docker cp $RESTORE_DIR/influxdb factory-influxdb:/tmp/restore
docker exec factory-influxdb influx restore /tmp/restore

# Restore Redis
docker cp $RESTORE_DIR/redis.rdb factory-redis:/data/dump.rdb
docker-compose restart redis

# Restore configurations
cp -r $RESTORE_DIR/config infrastructure/
cp $RESTORE_DIR/.env ./
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Default passwords changed
- [ ] SSL/TLS certificates installed
- [ ] Firewall rules configured
- [ ] Monitoring dashboards set up
- [ ] Backup procedures tested
- [ ] Recovery procedures tested
- [ ] Performance baseline established
- [ ] Documentation updated
- [ ] Team trained on operations

## Support and Contact

- **Technical Support**: [Insert contact information]
- **Documentation**: [Insert documentation links]
- **Issue Tracking**: [Insert issue tracker URL]
- **Emergency Contact**: [Insert emergency contact information]