# Design Document

## Overview

The InfluxDB dashboard integration design addresses the current connection issues between the factory dashboard and InfluxDB database. The system will implement environment-aware data source selection, robust connection handling, and real-time data synchronization. The design ensures that Docker deployments use live InfluxDB data while GitHub Pages deployments use simulated data.

## Architecture

### Current State Analysis

The existing system has:
- InfluxDBService class with comprehensive query capabilities
- FactoryContext managing data flow and connection state
- FallbackDataService providing simulation data
- Environment variables for InfluxDB configuration
- Connection health monitoring and automatic fallback

### Issues Identified

1. **Docker Environment Connection**: Dashboard URL configuration uses `localhost:8086` instead of Docker service name `influxdb:8086`
2. **Environment Detection**: No automatic detection between GitHub Pages and Docker deployments
3. **Connection Retry Logic**: Limited retry mechanisms for initial connection failures
4. **Data Mapping**: Potential misalignment between InfluxDB data structure and dashboard expectations
5. **Error Visibility**: Connection errors not clearly communicated to users

## Components and Interfaces

### 1. Environment Detection Service

**Purpose**: Automatically detect deployment environment and configure appropriate data sources.

```typescript
interface EnvironmentConfig {
  isGitHubPages: boolean;
  isDockerDeployment: boolean;
  shouldUseInfluxDB: boolean;
  influxDBConfig?: InfluxDBServiceConfig;
}

class EnvironmentDetectionService {
  detectEnvironment(): EnvironmentConfig;
  getDataSourceStrategy(): 'influxdb' | 'simulation';
}
```

**Detection Logic**:
- GitHub Pages: Check for `BASE_URL` containing GitHub Pages path or absence of InfluxDB environment variables
- Docker: Check for Docker-specific environment variables or service availability

### 2. Enhanced InfluxDB Service

**Purpose**: Improve connection reliability and data mapping accuracy.

**Enhancements**:
- Retry logic with exponential backoff for initial connections
- Better error categorization (network, authentication, data format)
- Improved data transformation to match dashboard Equipment interface
- Connection pooling and health monitoring

```typescript
interface ConnectionRetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

class EnhancedInfluxDBService extends InfluxDBService {
  connectWithRetry(retryConfig: ConnectionRetryConfig): Promise<boolean>;
  validateDataStructure(): Promise<boolean>;
  getConnectionDiagnostics(): ConnectionDiagnostics;
}
```

### 3. Data Source Manager

**Purpose**: Centralize data source selection and switching logic.

```typescript
interface DataSourceManager {
  currentSource: 'influxdb' | 'simulation';
  switchToInfluxDB(): Promise<boolean>;
  switchToSimulation(): void;
  getCurrentData(): Promise<FactoryLine[]>;
  getConnectionStatus(): ConnectionStatus;
}
```

### 4. Enhanced Factory Context

**Purpose**: Improve data flow management and error handling.

**Enhancements**:
- Environment-aware initialization
- Better error state management
- Clearer connection status indicators
- Configurable update intervals

## Data Models

### Equipment Data Mapping

**InfluxDB Structure** → **Dashboard Interface**:

```typescript
// InfluxDB measurements expected:
interface InfluxDBMeasurements {
  temperature: { value: number, equipment_id: string, line_id: string };
  conveyor_speed: { value: number, equipment_id: string, line_id: string };
  hydraulic_pressure: { value: number, equipment_id: string, line_id: string };
  heating_status: { enabled: boolean, equipment_id: string, line_id: string };
  motor_status: { running: boolean, equipment_id: string, line_id: string };
  message_quality: { quality_ratio: number, line_id: string };
}

// Dashboard Equipment interface (existing):
interface Equipment {
  id: string;
  name: string;
  type: 'oven' | 'conveyor' | 'press' | 'assembly' | 'oven-conveyor';
  status: 'running' | 'stopped' | 'error';
  temperature?: number;
  speed?: number;
  pressure?: number;
}
```

### Configuration Structure

```typescript
interface DeploymentConfig {
  environment: 'github-pages' | 'docker' | 'development';
  dataSource: 'influxdb' | 'simulation';
  influxdb?: {
    url: string;
    token: string;
    org: string;
    bucket: string;
    timeout: number;
    retryConfig: ConnectionRetryConfig;
  };
  updateIntervals: {
    dataRefresh: number;
    healthCheck: number;
    connectionRetry: number;
  };
}
```

## Error Handling

### Connection Error Categories

1. **Network Errors**: Service unavailable, timeout, DNS resolution
2. **Authentication Errors**: Invalid token, insufficient permissions
3. **Data Errors**: Invalid bucket, malformed queries, empty results
4. **Configuration Errors**: Missing environment variables, invalid URLs

### Error Recovery Strategies

1. **Immediate Fallback**: Switch to simulation data on connection failure
2. **Background Retry**: Continue attempting reconnection while using fallback
3. **Progressive Backoff**: Increase retry intervals to avoid overwhelming services
4. **User Notification**: Clear status indicators without blocking functionality

### Error Logging

```typescript
interface ErrorContext {
  errorType: 'network' | 'auth' | 'data' | 'config';
  component: string;
  operation: string;
  timestamp: Date;
  details: any;
  recoveryAction: string;
}
```

## Testing Strategy

### Unit Tests

1. **EnvironmentDetectionService**: Test environment detection logic
2. **EnhancedInfluxDBService**: Test connection retry and data transformation
3. **DataSourceManager**: Test source switching and data consistency
4. **Data Mapping**: Test InfluxDB to Equipment interface transformation

### Integration Tests

1. **Docker Environment**: Test full data flow from InfluxDB to dashboard
2. **GitHub Pages Environment**: Test simulation data flow
3. **Connection Failure**: Test fallback behavior and recovery
4. **Data Consistency**: Verify data accuracy between sources

### End-to-End Tests

1. **Dashboard Loading**: Test initial load in both environments
2. **Real-time Updates**: Test data refresh cycles
3. **Connection Recovery**: Test reconnection after service restart
4. **Error States**: Test user experience during various error conditions

## Implementation Phases

### Phase 1: Environment Detection
- Implement EnvironmentDetectionService
- Add environment-aware configuration
- Update build process for environment variables

### Phase 2: Connection Improvements
- Enhance InfluxDBService with retry logic
- Fix Docker service URL configuration
- Improve error handling and logging

### Phase 3: Data Source Management
- Implement DataSourceManager
- Update FactoryContext for better source switching
- Add connection status indicators

### Phase 4: Testing and Validation
- Comprehensive testing in both environments
- Performance optimization
- Documentation updates

## Configuration Changes

### Docker Compose Updates

```yaml
dashboard:
  environment:
    - VITE_INFLUXDB_URL=http://influxdb:8086  # Fix service name
    - VITE_DEPLOYMENT_ENV=docker
    - VITE_DATA_SOURCE=influxdb
```

### GitHub Pages Build

```yaml
- name: Build application
  run: npm run build
  env:
    VITE_DEPLOYMENT_ENV: github-pages
    VITE_DATA_SOURCE: simulation
```

### Environment Variables

```typescript
// Runtime environment detection
const config = {
  deploymentEnv: import.meta.env.VITE_DEPLOYMENT_ENV || 'auto-detect',
  dataSource: import.meta.env.VITE_DATA_SOURCE || 'auto-detect',
  influxdbUrl: import.meta.env.VITE_INFLUXDB_URL,
  // ... other config
};
```