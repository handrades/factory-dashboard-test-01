import { QueueConsumerService, QueueConsumerServiceConfig } from './service/queue-consumer-service';
import { DynamicQueueDiscovery } from './config/dynamic-queue-discovery';
import { resolve } from 'path';

// Load configuration from environment variables or use defaults
const config: QueueConsumerServiceConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    database: parseInt(process.env.REDIS_DATABASE || '0', 10),
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '5', 10),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
    consumerGroup: process.env.CONSUMER_GROUP || 'factory-dashboard-consumers',
    consumerId: process.env.CONSUMER_ID || `consumer-${Date.now()}`,
    deadLetterQueue: process.env.DEAD_LETTER_QUEUE || 'dead-letter-queue',
    processingTimeout: parseInt(process.env.PROCESSING_TIMEOUT || '30000', 10)
  },
  influxdb: {
    url: process.env.INFLUXDB_URL || 'http://localhost:8086',
    token: process.env.INFLUXDB_TOKEN || 'your-token-here',
    org: process.env.INFLUXDB_ORG || 'factory-dashboard',
    bucket: process.env.INFLUXDB_BUCKET || 'factory-data',
    timeout: parseInt(process.env.INFLUXDB_TIMEOUT || '10000', 10)
  },
  consumer: {
    queueName: 'plc_data',
    concurrency: parseInt(process.env.CONSUMER_CONCURRENCY || '5', 10),
    batchSize: parseInt(process.env.CONSUMER_BATCH_SIZE || '10', 10),
    visibilityTimeout: parseInt(process.env.CONSUMER_VISIBILITY_TIMEOUT || '5000', 10),
    processingTimeout: parseInt(process.env.CONSUMER_PROCESSING_TIMEOUT || '30000', 10)
  },
  writeOptions: {
    batchSize: parseInt(process.env.WRITE_BATCH_SIZE || '100', 10),
    flushInterval: parseInt(process.env.WRITE_FLUSH_INTERVAL || '1000', 10),
    retryAttempts: parseInt(process.env.WRITE_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.WRITE_RETRY_DELAY || '1000', 10)
  },
  transformation: {
    defaultMeasurement: 'plc_data',
    equipmentTypeMapping: {
      'oven': 'oven_metrics',
      'conveyor': 'conveyor_metrics',
      'press': 'press_metrics',
      'assembly': 'assembly_metrics'
    },
    tagRules: [
      // Temperature tags (oven equipment)
      {
        tagId: 'temperature',
        measurement: 'temperature',
        field: 'value',
        validate: (value) => typeof value === 'number' && value >= -50 && value <= 1000
      },
      // Heating status tags (oven equipment)
      {
        tagId: 'heating_status',
        measurement: 'heating_status',
        field: 'enabled',
        transform: (value) => Boolean(value)
      },
      // Door status tags (oven equipment)
      {
        tagId: 'door_status',
        measurement: 'door_status',
        field: 'open',
        transform: (value) => Boolean(value)
      },
      // Speed tags (conveyor equipment)
      {
        tagId: 'speed',
        measurement: 'conveyor_speed',
        field: 'value',
        validate: (value) => typeof value === 'number' && value >= 0 && value <= 100
      },
      // Motor status tags (conveyor equipment)
      {
        tagId: 'motor_status',
        measurement: 'motor_status',
        field: 'running',
        transform: (value) => Boolean(value)
      },
      // Belt tension tags (conveyor equipment)
      {
        tagId: 'belt_tension',
        measurement: 'belt_tension',
        field: 'value',
        validate: (value) => typeof value === 'number' && value >= 0 && value <= 200
      },
      // Pressure tags (press equipment)
      {
        tagId: 'pressure',
        measurement: 'hydraulic_pressure',
        field: 'value',
        validate: (value) => typeof value === 'number' && value >= 0 && value <= 1000
      },
      // Cycle count tags (press equipment)
      {
        tagId: 'cycle_count',
        measurement: 'cycle_count',
        field: 'value',
        validate: (value) => typeof value === 'number' && value >= 0
      },
      // Position tags (press equipment)
      {
        tagId: 'position',
        measurement: 'press_position',
        field: 'value',
        validate: (value) => typeof value === 'number' && value >= 0 && value <= 200
      },
      // Station status tags (assembly equipment)
      {
        tagId: /station\d+_status/,
        measurement: 'station_status',
        field: 'active',
        transform: (value) => Boolean(value)
      },
      // Cycle time tags (assembly equipment)
      {
        tagId: 'cycle_time',
        measurement: 'cycle_time',
        field: 'value',
        validate: (value) => typeof value === 'number' && value >= 0 && value <= 300
      }
    ],
    includeQualityMetrics: process.env.INCLUDE_QUALITY_METRICS !== 'false',
    timestampPrecision: (process.env.TIMESTAMP_PRECISION as 'ns' | 'ms' | 's') || 'ms'
  },
  errorHandler: {
    retryConfig: {
      maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
      initialDelay: parseInt(process.env.INITIAL_RETRY_DELAY || '1000', 10),
      maxDelay: parseInt(process.env.MAX_RETRY_DELAY || '30000', 10),
      backoffMultiplier: parseFloat(process.env.BACKOFF_MULTIPLIER || '2.0'),
      jitterMax: parseInt(process.env.JITTER_MAX || '1000', 10)
    },
    deadLetterQueueName: process.env.DEAD_LETTER_QUEUE || 'dead-letter-queue',
    enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
    alertThresholds: {
      errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.1'),
      consecutiveFailures: parseInt(process.env.CONSECUTIVE_FAILURES_THRESHOLD || '10', 10),
      responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000', 10)
    }
  },
  queueNames: [], // Will be populated dynamically
  enableMetrics: process.env.ENABLE_METRICS !== 'false',
  gracefulShutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '30000', 10)
};

async function main() {
  // Discover queue names dynamically from infrastructure config
  const configDirectory = process.env.CONFIG_DIRECTORY || resolve(__dirname, '../../../infrastructure/config');
  const queueDiscovery = new DynamicQueueDiscovery({
    configDirectory,
    queueNamePrefix: 'plc_data_'
  });

  try {
    console.log('Discovering equipment and queue names from infrastructure config...');
    const queueNames = await queueDiscovery.discoverQueueNames();
    const equipmentSummary = await queueDiscovery.getEquipmentSummary();
    
    console.log(`Discovered ${queueNames.length} queues for ${equipmentSummary.totalEquipment} equipment across ${Object.keys(equipmentSummary.equipmentByLine).length} production lines`);
    console.log('Equipment summary:', {
      byLine: equipmentSummary.equipmentByLine,
      bySite: equipmentSummary.equipmentBySite,
      byType: equipmentSummary.equipmentByType
    });

    // Update config with discovered queue names
    config.queueNames = queueNames;
  } catch (error) {
    console.error('Failed to discover queue names:', error);
    console.log('Falling back to environment variable QUEUE_NAMES or default queues');
    config.queueNames = (process.env.QUEUE_NAMES || 'plc_data_oven1,plc_data_conveyor1,plc_data_press1,plc_data_assembly1').split(',');
  }

  const service = new QueueConsumerService(config);
  
  // Set up event handlers for monitoring
  service.on('started', () => {
    console.log('Queue Consumer Service started successfully');
    
    // Log service metrics periodically
    setInterval(() => {
      const metrics = service.getServiceMetrics();
      console.log('Service Metrics:', {
        uptime: Math.round(metrics.uptime / 1000) + 's',
        messagesProcessed: metrics.messagesProcessed,
        messagesFailedProcessing: metrics.messagesFailedProcessing,
        dataPointsWritten: metrics.dataPointsWritten,
        processingRate: metrics.processingRate.toFixed(2) + '/s',
        avgProcessingTime: metrics.averageProcessingTime.toFixed(2) + 'ms',
        redisConnected: metrics.redisConnectionStatus,
        influxdbConnected: metrics.influxdbConnectionStatus
      });
    }, 60000); // Every minute
  });
  
  service.on('stopped', () => {
    console.log('Queue Consumer Service stopped');
  });
  
  service.on('startError', (error) => {
    console.error('Failed to start service:', error);
    process.exit(1);
  });
  
  service.on('redisConnected', () => {
    console.log('Connected to Redis message queue');
  });
  
  service.on('redisDisconnected', () => {
    console.warn('Disconnected from Redis message queue');
  });
  
  service.on('redisError', (error) => {
    console.error('Redis error:', error);
  });
  
  service.on('influxdbConnected', () => {
    console.log('Connected to InfluxDB');
  });
  
  service.on('influxdbDisconnected', () => {
    console.warn('Disconnected from InfluxDB');
  });
  
  service.on('influxdbError', (error) => {
    console.error('InfluxDB error:', error);
  });
  
  service.on('processingError', (error) => {
    console.error('Message processing error:', error);
  });
  
  service.on('deadLetterMessage', (message) => {
    console.error('Message sent to dead letter queue:', message);
  });
  
  service.on('circuitBreakerOpen', (event) => {
    console.error('Circuit breaker opened:', event);
  });
  
  service.on('circuitBreakerClosed', () => {
    console.log('Circuit breaker closed - service recovered');
  });
  
  service.on('alert', (alert) => {
    console.warn('Service alert:', alert);
  });
  
  service.on('metrics', (metrics) => {
    // Log detailed metrics if needed
    if (process.env.LOG_DETAILED_METRICS === 'true') {
      console.log('Detailed metrics:', metrics);
    }
  });
  
  // Health check endpoint (if running in Docker or with health checks)
  if (process.env.ENABLE_HEALTH_ENDPOINT === 'true') {
    const express = require('express');
    const app = express();
    
    app.get('/health', async (req: any, res: any) => {
      try {
        const healthCheck = await service.performHealthCheck();
        res.status(healthCheck.healthy ? 200 : 503).json(healthCheck);
      } catch (error: any) {
        res.status(500).json({ healthy: false, error: error.message });
      }
    });
    
    app.get('/metrics', (req: any, res: any) => {
      const stats = service.getDetailedStats();
      res.json(stats);
    });
    
    const port = parseInt(process.env.HEALTH_PORT || '8080', 10);
    app.listen(port, () => {
      console.log(`Health check server running on port ${port}`);
    });
  }
  
  try {
    await service.start();
  } catch (error) {
    console.error('Failed to start Queue Consumer Service:', error);
    process.exit(1);
  }
}

// Start the service
main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});