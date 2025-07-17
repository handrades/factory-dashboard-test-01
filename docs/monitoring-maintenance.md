# Monitoring and Maintenance Guide

## Overview

This guide provides comprehensive monitoring and maintenance procedures for the Factory Dashboard system to ensure optimal performance, reliability, and availability.

## System Monitoring

### Health Monitoring

#### Service Health Checks

```bash
#!/bin/bash
# health-check.sh

echo "=== Factory Dashboard Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Check Docker containers
echo "Container Status:"
docker-compose ps

# Check service health endpoints
echo -e "\nService Health Endpoints:"

# Dashboard health
if curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo "✅ Dashboard: Healthy"
else
    echo "❌ Dashboard: Unhealthy"
fi

# Queue Consumer health
if curl -f http://localhost:8080/health >/dev/null 2>&1; then
    echo "✅ Queue Consumer: Healthy"
else
    echo "❌ Queue Consumer: Unhealthy"
fi

# Redis health
if docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
    echo "✅ Redis: Healthy"
else
    echo "❌ Redis: Unhealthy"
fi

# InfluxDB health
if curl -f http://localhost:8086/health >/dev/null 2>&1; then
    echo "✅ InfluxDB: Healthy"
else
    echo "❌ InfluxDB: Unhealthy"
fi

echo ""
echo "=== End Health Check ==="
```

#### Automated Health Monitoring

```bash
# Add to crontab for automated monitoring
# Run every 5 minutes
*/5 * * * * /path/to/health-check.sh >> /var/log/health-check.log 2>&1

# Send alerts on failure
*/5 * * * * /path/to/health-check.sh | grep -q "❌" && echo "Factory Dashboard Alert: Service failure detected" | mail -s "Service Alert" admin@company.com
```

### Performance Monitoring

#### Key Performance Indicators (KPIs)

1. **Message Processing Rate**
   - Target: > 100 messages/second
   - Monitor: Queue Consumer metrics

2. **Data Latency**
   - Target: < 5 seconds end-to-end
   - Monitor: Timestamp differences

3. **System Uptime**
   - Target: > 99.5%
   - Monitor: Service availability

4. **Resource Utilization**
   - CPU: < 80%
   - Memory: < 85%
   - Disk: < 90%

#### Monitoring Script

```bash
#!/bin/bash
# performance-monitor.sh

echo "=== Performance Monitoring Report ==="
echo "Timestamp: $(date)"
echo ""

# System resources
echo "System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d% -f1)"
echo "Memory Usage: $(free | grep Mem | awk '{printf "%.2f%%", $3/$2 * 100.0}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{printf "%s", $5}')"
echo ""

# Docker container resources
echo "Container Resources:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo ""

# Redis metrics
echo "Redis Metrics:"
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep -E "(instantaneous_ops_per_sec|used_memory_human|connected_clients)"
echo ""

# InfluxDB metrics
echo "InfluxDB Metrics:"
curl -s -G "http://localhost:8086/metrics" | grep -E "(influxdb_http_requests_total|influxdb_queryExecutor_queries_total)"
echo ""

# Queue depths
echo "Queue Depths:"
for queue in $(docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" keys "plc_data_*"); do
    depth=$(docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" llen "$queue")
    echo "$queue: $depth"
done
```

### Grafana Dashboard Configuration

#### Factory Overview Dashboard

```json
{
  "dashboard": {
    "title": "Factory Dashboard Overview",
    "panels": [
      {
        "title": "Message Processing Rate",
        "type": "graph",
        "targets": [
          {
            "measurement": "message_processing",
            "field": "rate",
            "groupBy": ["time(1m)"]
          }
        ],
        "yAxes": [
          {
            "label": "Messages/Second",
            "min": 0
          }
        ]
      },
      {
        "title": "System Resources",
        "type": "singlestat",
        "targets": [
          {
            "measurement": "system_metrics",
            "field": "cpu_usage"
          }
        ],
        "thresholds": [50, 80],
        "colors": ["green", "yellow", "red"]
      },
      {
        "title": "Service Health",
        "type": "table",
        "targets": [
          {
            "measurement": "service_health",
            "field": "status",
            "groupBy": ["service"]
          }
        ]
      }
    ]
  }
}
```

#### Alert Rules

```yaml
# monitoring/alerts/alert-rules.yml
groups:
  - name: factory_dashboard
    rules:
      - alert: HighMessageLatency
        expr: message_latency > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High message processing latency"
          description: "Message latency is {{ $value }}s, exceeding threshold"

      - alert: ServiceDown
        expr: service_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "{{ $labels.service }} has been down for more than 1 minute"

      - alert: HighCPUUsage
        expr: cpu_usage > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ $value }}%, exceeding 80% threshold"

      - alert: HighMemoryUsage
        expr: memory_usage > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}%, exceeding 85% threshold"

      - alert: DiskSpaceLow
        expr: disk_usage > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk space low"
          description: "Disk usage is {{ $value }}%, exceeding 90% threshold"
```

## Maintenance Procedures

### Routine Maintenance

#### Daily Maintenance Checklist

- [ ] Check service health status
- [ ] Review system logs for errors
- [ ] Monitor resource utilization
- [ ] Verify data processing rates
- [ ] Check queue depths
- [ ] Validate dashboard functionality

#### Weekly Maintenance Checklist

- [ ] Backup configuration files
- [ ] Backup databases (InfluxDB, Redis)
- [ ] Update container images
- [ ] Review performance metrics
- [ ] Check disk space usage
- [ ] Validate alarm configurations
- [ ] Test disaster recovery procedures

#### Monthly Maintenance Checklist

- [ ] Full system backup
- [ ] Security audit
- [ ] Performance optimization review
- [ ] Capacity planning assessment
- [ ] Documentation updates
- [ ] Team training updates

### Database Maintenance

#### InfluxDB Maintenance

```bash
#!/bin/bash
# influxdb-maintenance.sh

echo "=== InfluxDB Maintenance ==="

# Check database size
echo "Database Size:"
docker exec factory-influxdb du -sh /var/lib/influxdb2

# Run compaction
echo "Running compaction..."
docker exec factory-influxdb influx backup --compression gzip /tmp/backup

# Check retention policies
echo "Retention Policies:"
docker exec factory-influxdb influx bucket list

# Optimize performance
echo "Optimizing performance..."
docker exec factory-influxdb influx query 'DROP SERIES WHERE time < now() - 30d'
```

#### Redis Maintenance

```bash
#!/bin/bash
# redis-maintenance.sh

echo "=== Redis Maintenance ==="

# Check memory usage
echo "Memory Usage:"
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" INFO memory | grep used_memory_human

# Run BGSAVE for backup
echo "Creating backup..."
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE

# Check key expiration
echo "Key Statistics:"
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" INFO keyspace

# Optimize memory
echo "Optimizing memory..."
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" MEMORY PURGE
```

### Log Management

#### Log Rotation Configuration

```bash
# /etc/logrotate.d/factory-dashboard
/var/log/factory-dashboard/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    postrotate
        docker-compose restart rsyslog
    endscript
}
```

#### Log Analysis Script

```bash
#!/bin/bash
# log-analysis.sh

echo "=== Log Analysis Report ==="
echo "Period: $(date -d '1 day ago' '+%Y-%m-%d') to $(date '+%Y-%m-%d')"
echo ""

# Error analysis
echo "Error Summary:"
grep -c "ERROR" /var/log/factory-dashboard/*.log
echo ""

# Performance analysis
echo "Performance Metrics:"
grep "processing_time" /var/log/factory-dashboard/*.log | awk '{sum+=$NF; count++} END {print "Average processing time:", sum/count "ms"}'
echo ""

# Top errors
echo "Top Errors:"
grep "ERROR" /var/log/factory-dashboard/*.log | sort | uniq -c | sort -nr | head -10
```

### Security Maintenance

#### Security Audit Script

```bash
#!/bin/bash
# security-audit.sh

echo "=== Security Audit ==="
echo "Date: $(date)"
echo ""

# Check for default passwords
echo "Password Security:"
if grep -q "factory123" .env; then
    echo "⚠️  Default passwords detected"
else
    echo "✅ No default passwords found"
fi

# Check SSL/TLS configuration
echo "SSL/TLS Configuration:"
if [ -f "/etc/ssl/certs/factory-dashboard.crt" ]; then
    echo "✅ SSL certificate found"
    openssl x509 -in /etc/ssl/certs/factory-dashboard.crt -text -noout | grep "Not After"
else
    echo "⚠️  No SSL certificate found"
fi

# Check network security
echo "Network Security:"
netstat -tuln | grep -E "(3000|6379|8086|8080)"

# Check file permissions
echo "File Permissions:"
find . -name "*.env" -exec ls -la {} \;
```

#### Vulnerability Scanning

```bash
#!/bin/bash
# vulnerability-scan.sh

echo "=== Vulnerability Scan ==="

# Update container images
echo "Updating container images..."
docker-compose pull

# Scan for vulnerabilities
echo "Scanning for vulnerabilities..."
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image factory-dashboard:latest

# Check for outdated dependencies
echo "Checking dependencies..."
docker run --rm -v $(pwd):/app -w /app node:alpine npm audit
```

### Backup and Recovery

#### Automated Backup Script

```bash
#!/bin/bash
# backup-system.sh

BACKUP_DIR="/backups/factory-dashboard"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$DATE"

echo "=== System Backup ==="
echo "Starting backup at $(date)"

# Create backup directory
mkdir -p "$BACKUP_PATH"

# Backup InfluxDB
echo "Backing up InfluxDB..."
docker exec factory-influxdb influx backup /tmp/backup
docker cp factory-influxdb:/tmp/backup "$BACKUP_PATH/influxdb"

# Backup Redis
echo "Backing up Redis..."
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" --rdb /data/dump.rdb
docker cp factory-redis:/data/dump.rdb "$BACKUP_PATH/redis.rdb"

# Backup configuration
echo "Backing up configuration..."
cp -r infrastructure/config "$BACKUP_PATH/"
cp .env "$BACKUP_PATH/" 2>/dev/null || echo "No .env file found"

# Backup logs
echo "Backing up logs..."
cp -r /var/log/factory-dashboard "$BACKUP_PATH/logs"

# Compress backup
echo "Compressing backup..."
tar -czf "$BACKUP_PATH.tar.gz" -C "$BACKUP_DIR" "backup_$DATE"
rm -rf "$BACKUP_PATH"

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_PATH.tar.gz"
```

#### Recovery Testing

```bash
#!/bin/bash
# test-recovery.sh

echo "=== Recovery Test ==="

# Test database recovery
echo "Testing database recovery..."
docker-compose down
docker volume rm factory-dashboard_influxdb_data
docker volume rm factory-dashboard_redis_data

# Start services
docker-compose up -d

# Wait for services
sleep 30

# Restore from backup
./restore-system.sh backups/factory-dashboard/backup_latest.tar.gz

# Verify recovery
./health-check.sh

echo "Recovery test completed"
```

### Performance Optimization

#### Resource Optimization

```bash
#!/bin/bash
# optimize-resources.sh

echo "=== Resource Optimization ==="

# Docker system cleanup
echo "Cleaning up Docker resources..."
docker system prune -af

# Optimize container resources
echo "Optimizing container resources..."
docker-compose down
docker-compose up -d --force-recreate

# Optimize databases
echo "Optimizing databases..."
./influxdb-maintenance.sh
./redis-maintenance.sh

# Check results
echo "Resource optimization completed"
docker stats --no-stream
```

#### Performance Tuning

```bash
#!/bin/bash
# performance-tuning.sh

echo "=== Performance Tuning ==="

# Tune kernel parameters
echo "Tuning kernel parameters..."
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w vm.swappiness=10

# Optimize Docker settings
echo "Optimizing Docker settings..."
echo '{"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}' > /etc/docker/daemon.json
systemctl restart docker

# Update container limits
echo "Updating container limits..."
docker-compose down
docker-compose up -d

echo "Performance tuning completed"
```

### Troubleshooting

#### Common Issues and Solutions

1. **High Memory Usage**
```bash
# Check memory usage
docker stats --no-stream

# Restart memory-intensive services
docker-compose restart queue-consumer

# Optimize Redis memory
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" MEMORY PURGE
```

2. **Queue Backlog**
```bash
# Check queue depths
docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" llen plc_data_queue

# Increase consumer concurrency
export CONSUMER_CONCURRENCY=20
docker-compose up -d queue-consumer

# Monitor processing rate
watch -n 1 'docker exec factory-redis redis-cli -a "$REDIS_PASSWORD" llen plc_data_queue'
```

3. **Database Connection Issues**
```bash
# Test database connectivity
docker exec factory-influxdb influx ping

# Check database logs
docker logs factory-influxdb

# Restart database if needed
docker-compose restart influxdb
```

#### Diagnostic Script

```bash
#!/bin/bash
# diagnose-issues.sh

echo "=== System Diagnostics ==="

# Check system resources
echo "System Resources:"
df -h
free -h
uptime

# Check container status
echo "Container Status:"
docker-compose ps

# Check logs for errors
echo "Recent Errors:"
docker-compose logs --tail=50 | grep -i error

# Check network connectivity
echo "Network Connectivity:"
docker network ls
docker network inspect factory-network

# Check port availability
echo "Port Status:"
netstat -tuln | grep -E "(3000|6379|8086|8080)"

echo "Diagnostics completed"
```

### Monitoring Dashboard

#### Metrics Collection

```bash
#!/bin/bash
# collect-metrics.sh

# Collect system metrics
echo "timestamp,cpu_usage,memory_usage,disk_usage" > /tmp/system_metrics.csv
echo "$(date +%s),$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d% -f1),$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}'),$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')" >> /tmp/system_metrics.csv

# Collect application metrics
docker stats --no-stream --format "{{.Container}},{{.CPUPerc}},{{.MemUsage}}" >> /tmp/container_metrics.csv

# Send metrics to InfluxDB
curl -X POST "http://localhost:8086/api/v2/write?org=factory-dashboard&bucket=monitoring" \
  -H "Authorization: Token $INFLUXDB_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/system_metrics.csv
```

### Maintenance Schedule

#### Automated Maintenance

```bash
# Add to crontab
# Daily maintenance at 2 AM
0 2 * * * /path/to/daily-maintenance.sh

# Weekly maintenance on Sunday at 3 AM
0 3 * * 0 /path/to/weekly-maintenance.sh

# Monthly maintenance on 1st at 4 AM
0 4 1 * * /path/to/monthly-maintenance.sh

# Backup every 6 hours
0 */6 * * * /path/to/backup-system.sh

# Health check every 5 minutes
*/5 * * * * /path/to/health-check.sh
```

## Best Practices

1. **Proactive Monitoring**: Monitor leading indicators, not just failures
2. **Automation**: Automate routine maintenance tasks
3. **Documentation**: Keep maintenance logs and procedures updated
4. **Testing**: Regularly test backup and recovery procedures
5. **Alerting**: Set up meaningful alerts with proper thresholds
6. **Capacity Planning**: Monitor trends and plan for growth
7. **Security**: Regularly update and patch systems
8. **Training**: Ensure team is trained on maintenance procedures

## Emergency Procedures

### Emergency Contacts

- **System Administrator**: [Contact Information]
- **Database Administrator**: [Contact Information]
- **Network Administrator**: [Contact Information]
- **Vendor Support**: [Contact Information]

### Escalation Matrix

1. **Level 1**: Automated monitoring alerts
2. **Level 2**: On-call engineer notification
3. **Level 3**: Team lead escalation
4. **Level 4**: Management escalation
5. **Level 5**: Vendor support engagement

### Recovery Procedures

1. **Immediate Response**: Assess impact and stabilize system
2. **Communication**: Notify stakeholders and management
3. **Investigation**: Identify root cause
4. **Recovery**: Implement fix and restore service
5. **Post-Incident**: Document lessons learned and improve procedures