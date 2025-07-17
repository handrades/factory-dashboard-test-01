# Configuration Reference

## Overview

This document provides comprehensive configuration reference for the Factory Dashboard system.

## Environment Variables

### Core System Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Application environment | `development` | No |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` | No |
| `PORT` | Application port | `3000` | No |

### Redis Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_HOST` | Redis server hostname | `localhost` | No |
| `REDIS_PORT` | Redis server port | `6379` | No |
| `REDIS_PASSWORD` | Redis authentication password | `your_password` | Yes |
| `REDIS_DB` | Redis database number | `0` | No |
| `REDIS_TIMEOUT` | Connection timeout (ms) | `5000` | No |
| `REDIS_RETRY_DELAY` | Retry delay (ms) | `1000` | No |

### InfluxDB Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `INFLUXDB_URL` | InfluxDB server URL | `http://localhost:8086` | No |
| `INFLUXDB_TOKEN` | InfluxDB authentication token | `factory-admin-token` | Yes |
| `INFLUXDB_ORG` | InfluxDB organization | `factory-dashboard` | Yes |
| `INFLUXDB_BUCKET` | InfluxDB bucket name | `factory-data` | Yes |
| `INFLUXDB_TIMEOUT` | Query timeout (ms) | `30000` | No |

### PLC Emulator Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `UPDATE_INTERVAL` | Data update interval (ms) | `2000` | No |
| `HEARTBEAT_INTERVAL` | Heartbeat interval (ms) | `30000` | No |
| `CONFIG_PATH` | Equipment configuration file path | `/app/config/sample-equipment.json` | No |
| `SIMULATION_MODE` | Simulation mode (realistic, random, demo) | `realistic` | No |
| `ERROR_INJECTION_RATE` | Error injection rate (0-1) | `0.05` | No |

### Queue Consumer Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CONSUMER_CONCURRENCY` | Number of concurrent consumers | `5` | No |
| `BATCH_SIZE` | Message batch size | `100` | No |
| `BATCH_TIMEOUT` | Batch timeout (ms) | `5000` | No |
| `RETRY_ATTEMPTS` | Max retry attempts | `3` | No |
| `RETRY_DELAY` | Retry delay (ms) | `1000` | No |
| `DEAD_LETTER_QUEUE` | Dead letter queue name | `dead-letter-queue` | No |

### Health Check Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENABLE_HEALTH_ENDPOINT` | Enable health check endpoint | `true` | No |
| `HEALTH_PORT` | Health check port | `8080` | No |
| `HEALTH_TIMEOUT` | Health check timeout (ms) | `5000` | No |

### Monitoring Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENABLE_METRICS` | Enable metrics collection | `true` | No |
| `METRICS_PORT` | Metrics endpoint port | `9090` | No |
| `METRICS_INTERVAL` | Metrics collection interval (ms) | `10000` | No |

## Equipment Configuration

### Equipment Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "lineId": {
      "type": "string",
      "description": "Unique identifier for the production line"
    },
    "lineName": {
      "type": "string",
      "description": "Human-readable name for the production line"
    },
    "equipment": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/equipment"
      }
    }
  },
  "required": ["lineId", "lineName", "equipment"],
  "definitions": {
    "equipment": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique equipment identifier"
        },
        "name": {
          "type": "string",
          "description": "Equipment display name"
        },
        "type": {
          "type": "string",
          "enum": ["oven", "conveyor", "press", "assembly", "sensor", "actuator"],
          "description": "Equipment type"
        },
        "position": {
          "type": "object",
          "properties": {
            "x": { "type": "number" },
            "y": { "type": "number" }
          },
          "required": ["x", "y"]
        },
        "tags": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/tag"
          }
        },
        "settings": {
          "type": "object",
          "description": "Equipment-specific settings"
        }
      },
      "required": ["id", "name", "type", "position", "tags"]
    },
    "tag": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Tag identifier"
        },
        "name": {
          "type": "string",
          "description": "Tag display name"
        },
        "dataType": {
          "type": "string",
          "enum": ["boolean", "integer", "float", "string"],
          "description": "Data type"
        },
        "unit": {
          "type": "string",
          "description": "Unit of measurement"
        },
        "range": {
          "type": "object",
          "properties": {
            "min": { "type": "number" },
            "max": { "type": "number" }
          }
        },
        "alarms": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/alarm"
          }
        }
      },
      "required": ["id", "name", "dataType"]
    },
    "alarm": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["high", "low", "deviation", "rate_of_change"]
        },
        "threshold": { "type": "number" },
        "severity": {
          "type": "string",
          "enum": ["low", "medium", "high", "critical"]
        },
        "message": { "type": "string" }
      },
      "required": ["type", "threshold", "severity"]
    }
  }
}
```

### Equipment Type Configurations

#### Industrial Oven

```json
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
      "range": { "min": 200, "max": 400 },
      "alarms": [
        {
          "type": "high",
          "threshold": 380,
          "severity": "high",
          "message": "Oven temperature too high"
        }
      ]
    },
    {
      "id": "heating_status",
      "name": "Heating Status",
      "dataType": "boolean"
    },
    {
      "id": "door_status",
      "name": "Door Status",
      "dataType": "boolean"
    }
  ],
  "settings": {
    "heatUpRate": 5.0,
    "coolDownRate": 2.0,
    "targetTemperature": 350
  }
}
```

#### Conveyor Belt

```json
{
  "id": "line1_conveyor_01",
  "name": "Conveyor Belt 1",
  "type": "conveyor",
  "position": { "x": 300, "y": 200 },
  "tags": [
    {
      "id": "speed",
      "name": "Belt Speed",
      "dataType": "float",
      "unit": "m/s",
      "range": { "min": 0, "max": 5 }
    },
    {
      "id": "motor_status",
      "name": "Motor Status",
      "dataType": "boolean"
    },
    {
      "id": "belt_tension",
      "name": "Belt Tension",
      "dataType": "float",
      "unit": "N",
      "range": { "min": 50, "max": 100 }
    }
  ],
  "settings": {
    "nominalSpeed": 2.5,
    "acceleration": 0.5,
    "deceleration": 0.8
  }
}
```

#### Press Machine

```json
{
  "id": "line1_press_01",
  "name": "Press Machine 1",
  "type": "press",
  "position": { "x": 500, "y": 200 },
  "tags": [
    {
      "id": "pressure",
      "name": "Hydraulic Pressure",
      "dataType": "float",
      "unit": "bar",
      "range": { "min": 0, "max": 200 }
    },
    {
      "id": "position",
      "name": "Ram Position",
      "dataType": "float",
      "unit": "mm",
      "range": { "min": 0, "max": 100 }
    },
    {
      "id": "cycle_count",
      "name": "Cycle Count",
      "dataType": "integer"
    }
  ],
  "settings": {
    "maxPressure": 180,
    "cycleTime": 30,
    "safetyPosition": 90
  }
}
```

#### Assembly Station

```json
{
  "id": "line1_assembly_01",
  "name": "Assembly Station 1",
  "type": "assembly",
  "position": { "x": 700, "y": 200 },
  "tags": [
    {
      "id": "station1_active",
      "name": "Station 1 Active",
      "dataType": "boolean"
    },
    {
      "id": "station2_active",
      "name": "Station 2 Active",
      "dataType": "boolean"
    },
    {
      "id": "cycle_time",
      "name": "Assembly Cycle Time",
      "dataType": "float",
      "unit": "s",
      "range": { "min": 20, "max": 40 }
    }
  ],
  "settings": {
    "stationCount": 2,
    "targetCycleTime": 28,
    "qualityCheckEnabled": true
  }
}
```

## Production Line Templates

### Template Structure

```json
{
  "templates": {
    "automotive_line": {
      "description": "Automotive production line template",
      "equipment": [
        {
          "type": "conveyor",
          "count": 3,
          "spacing": 200,
          "settings": {
            "speed": 2.0,
            "direction": "forward"
          }
        },
        {
          "type": "press",
          "count": 2,
          "spacing": 400,
          "settings": {
            "pressure": 150,
            "cycleTime": 25
          }
        },
        {
          "type": "assembly",
          "count": 1,
          "settings": {
            "stationCount": 4,
            "cycleTime": 35
          }
        }
      ]
    },
    "electronics_line": {
      "description": "Electronics manufacturing line template",
      "equipment": [
        {
          "type": "oven",
          "count": 2,
          "spacing": 300,
          "settings": {
            "temperature": 280,
            "rampRate": 3.0
          }
        },
        {
          "type": "conveyor",
          "count": 4,
          "spacing": 150,
          "settings": {
            "speed": 1.5,
            "precision": "high"
          }
        },
        {
          "type": "assembly",
          "count": 3,
          "settings": {
            "stationCount": 6,
            "cycleTime": 20
          }
        }
      ]
    }
  }
}
```

## Alarm Configuration

### Alarm Types

#### Threshold Alarms

```json
{
  "alarms": [
    {
      "type": "high",
      "threshold": 380,
      "severity": "high",
      "message": "Temperature exceeds maximum threshold",
      "action": "shutdown",
      "delay": 5000
    },
    {
      "type": "low",
      "threshold": 200,
      "severity": "medium",
      "message": "Temperature below minimum threshold",
      "action": "warning",
      "delay": 10000
    }
  ]
}
```

#### Deviation Alarms

```json
{
  "alarms": [
    {
      "type": "deviation",
      "threshold": 10,
      "baseline": "setpoint",
      "severity": "medium",
      "message": "Temperature deviation from setpoint",
      "action": "alert",
      "delay": 15000
    }
  ]
}
```

#### Rate of Change Alarms

```json
{
  "alarms": [
    {
      "type": "rate_of_change",
      "threshold": 5,
      "timeWindow": 30000,
      "severity": "high",
      "message": "Rapid temperature change detected",
      "action": "investigate",
      "delay": 0
    }
  ]
}
```

## Data Retention Policies

### InfluxDB Retention Policies

```json
{
  "retention_policies": {
    "raw_data": {
      "duration": "7d",
      "description": "Raw sensor data retention for 7 days"
    },
    "hourly_aggregates": {
      "duration": "30d",
      "description": "Hourly aggregated data retention for 30 days"
    },
    "daily_aggregates": {
      "duration": "365d",
      "description": "Daily aggregated data retention for 1 year"
    }
  }
}
```

### Data Aggregation Rules

```json
{
  "aggregation_rules": [
    {
      "source": "raw_data",
      "target": "hourly_aggregates",
      "interval": "1h",
      "functions": ["mean", "min", "max", "count"]
    },
    {
      "source": "hourly_aggregates",
      "target": "daily_aggregates",
      "interval": "1d",
      "functions": ["mean", "min", "max"]
    }
  ]
}
```

## Security Configuration

### Authentication Settings

```json
{
  "authentication": {
    "enabled": true,
    "provider": "local",
    "sessionTimeout": 3600,
    "maxFailedAttempts": 5,
    "lockoutDuration": 900
  }
}
```

### Authorization Settings

```json
{
  "authorization": {
    "roles": {
      "admin": {
        "permissions": ["read", "write", "delete", "configure"]
      },
      "operator": {
        "permissions": ["read", "write"]
      },
      "viewer": {
        "permissions": ["read"]
      }
    }
  }
}
```

### TLS Configuration

```json
{
  "tls": {
    "enabled": true,
    "certificatePath": "/etc/ssl/certs/factory-dashboard.crt",
    "privateKeyPath": "/etc/ssl/private/factory-dashboard.key",
    "minVersion": "TLSv1.2",
    "cipherSuites": [
      "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
      "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"
    ]
  }
}
```

## Performance Tuning

### Resource Limits

```yaml
# docker-compose.yml
services:
  plc-emulator:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  queue-consumer:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '1.0'
          memory: 512M
```

### Buffer Sizes

```json
{
  "performance": {
    "redis": {
      "maxConnections": 100,
      "connectionTimeout": 5000,
      "commandTimeout": 3000
    },
    "influxdb": {
      "batchSize": 1000,
      "flushInterval": 1000,
      "maxRetries": 3
    },
    "queue": {
      "maxSize": 10000,
      "batchSize": 100,
      "processTimeout": 30000
    }
  }
}
```

## Logging Configuration

### Log Levels

```json
{
  "logging": {
    "level": "info",
    "format": "json",
    "outputs": [
      {
        "type": "console",
        "level": "info"
      },
      {
        "type": "file",
        "level": "debug",
        "filename": "/var/log/factory-dashboard.log",
        "maxSize": "100MB",
        "maxFiles": 10
      }
    ]
  }
}
```

### Log Categories

```json
{
  "loggers": {
    "plc-emulator": {
      "level": "info",
      "additivity": false,
      "appenders": ["console", "file"]
    },
    "queue-consumer": {
      "level": "debug",
      "additivity": false,
      "appenders": ["console", "file"]
    },
    "dashboard": {
      "level": "warn",
      "additivity": false,
      "appenders": ["console"]
    }
  }
}
```

## Validation Rules

### Configuration Validation

The system validates all configuration files against JSON schemas. Key validation rules include:

1. **Required Fields**: All required fields must be present
2. **Data Types**: Values must match expected data types
3. **Range Validation**: Numeric values must be within specified ranges
4. **Enum Validation**: String values must match predefined options
5. **Reference Validation**: Equipment references must exist

### Runtime Validation

```json
{
  "validation": {
    "strictMode": true,
    "validateOnStartup": true,
    "validateOnChange": true,
    "validationTimeout": 10000
  }
}
```

## Migration Guide

### Configuration Migration

When upgrading between versions, configuration files may need migration:

```bash
# Run migration script
./scripts/migrate-config.sh --from=v1.0 --to=v2.0

# Validate migrated configuration
./scripts/validate-config.sh
```

### Schema Changes

Check `CHANGELOG.md` for configuration schema changes between versions.

## Best Practices

1. **Version Control**: Store configuration files in version control
2. **Environment Separation**: Use different configurations for dev/test/prod
3. **Validation**: Always validate configurations before deployment
4. **Documentation**: Document custom configurations and modifications
5. **Backup**: Backup configuration files before making changes
6. **Testing**: Test configuration changes in non-production environments
7. **Security**: Never commit sensitive information to version control