import { EventEmitter } from 'events';
import winston, { createLogger } from 'winston';
import { PLCMessage, InfluxDBConfig, ConsumerConfig, WriteOptions } from '@factory-dashboard/shared-types';
import { RedisConsumer, RedisConsumerConfig } from '../messaging/redis-consumer';
import { InfluxDBClient } from '../influxdb/influxdb-client';
import { MessageTransformer, TransformationConfig } from '../processing/message-transformer';
import { ErrorHandler, ErrorHandlerConfig } from '../processing/error-handler';

export interface QueueConsumerServiceConfig {
  redis: RedisConsumerConfig;
  influxdb: InfluxDBConfig;
  consumer: ConsumerConfig;
  writeOptions: WriteOptions;
  transformation: TransformationConfig;
  errorHandler: ErrorHandlerConfig;
  queueNames: string[];
  enableMetrics: boolean;
  gracefulShutdownTimeout: number;
}

export interface ServiceMetrics {
  messagesProcessed: number;
  messagesFailedProcessing: number;
  dataPointsWritten: number;
  influxdbWriteErrors: number;
  uptime: number;
  processingRate: number;
  averageProcessingTime: number;
  redisConnectionStatus: boolean;
  influxdbConnectionStatus: boolean;
}

export class QueueConsumerService extends EventEmitter {
  private config: QueueConsumerServiceConfig;
  private logger: ReturnType<typeof createLogger>;
  private redisConsumer: RedisConsumer;
  private influxdbClient: InfluxDBClient;
  private messageTransformer: MessageTransformer;
  private errorHandler: ErrorHandler;
  
  private isRunning: boolean = false;
  private startTime: Date = new Date();
  private processingTimes: number[] = [];
  private metricsTimer?: NodeJS.Timeout;
  
  private metrics: ServiceMetrics = {
    messagesProcessed: 0,
    messagesFailedProcessing: 0,
    dataPointsWritten: 0,
    influxdbWriteErrors: 0,
    uptime: 0,
    processingRate: 0,
    averageProcessingTime: 0,
    redisConnectionStatus: false,
    influxdbConnectionStatus: false
  };

  constructor(config: QueueConsumerServiceConfig) {
    super();
    this.config = config;
    
    this.logger = createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'queue-consumer.log' })
      ]
    });

    this.redisConsumer = new RedisConsumer(config.redis);
    this.influxdbClient = new InfluxDBClient(config.influxdb, config.writeOptions);
    this.messageTransformer = new MessageTransformer(config.transformation);
    this.errorHandler = new ErrorHandler(config.errorHandler);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Redis consumer events
    this.redisConsumer.on('connected', () => {
      this.logger.info('Redis consumer connected');
      this.metrics.redisConnectionStatus = true;
      this.emit('redisConnected');
    });

    this.redisConsumer.on('disconnected', () => {
      this.logger.warn('Redis consumer disconnected');
      this.metrics.redisConnectionStatus = false;
      this.emit('redisDisconnected');
    });

    this.redisConsumer.on('error', (error) => {
      this.logger.error(`Redis consumer error: ${error}`);
      this.emit('redisError', error);
    });

    this.redisConsumer.on('message', async (message: PLCMessage, callback: (error?: Error) => void) => {
      await this.processMessage(message, callback);
    });

    // InfluxDB client events
    this.influxdbClient.on('connected', () => {
      this.logger.info('InfluxDB client connected');
      this.metrics.influxdbConnectionStatus = true;
      this.emit('influxdbConnected');
    });

    this.influxdbClient.on('disconnected', () => {
      this.logger.warn('InfluxDB client disconnected');
      this.metrics.influxdbConnectionStatus = false;
      this.emit('influxdbDisconnected');
    });

    this.influxdbClient.on('writeError', (error) => {
      this.logger.error(`InfluxDB write error: ${error}`);
      this.metrics.influxdbWriteErrors++;
      this.emit('influxdbError', error);
    });

    // Error handler events
    this.errorHandler.on('error', (error) => {
      this.logger.error('Processing error:', error);
      this.emit('processingError', error);
    });

    this.errorHandler.on('deadLetterMessage', (deadLetterMessage) => {
      this.logger.error('Message sent to dead letter queue:', deadLetterMessage);
      this.emit('deadLetterMessage', deadLetterMessage);
    });

    this.errorHandler.on('circuitBreakerOpen', (event) => {
      this.logger.error('Circuit breaker opened:', event);
      this.emit('circuitBreakerOpen', event);
    });

    this.errorHandler.on('circuitBreakerClosed', () => {
      this.logger.info('Circuit breaker closed');
      this.emit('circuitBreakerClosed');
    });

    this.errorHandler.on('alert', (alert) => {
      this.logger.warn('Error handler alert:', alert);
      this.emit('alert', alert);
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGUSR2', () => this.handleShutdown('SIGUSR2'));
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting Queue Consumer Service');
      
      // Connect to Redis
      await this.redisConsumer.connect();
      
      // Connect to InfluxDB
      await this.influxdbClient.connect();
      
      // Start consuming messages
      await this.redisConsumer.startConsuming(this.config.queueNames, this.config.consumer);
      
      // Start metrics collection
      if (this.config.enableMetrics) {
        this.startMetricsCollection();
      }
      
      this.isRunning = true;
      this.startTime = new Date();
      
      this.logger.info('Queue Consumer Service started successfully');
      this.emit('started');
      
    } catch {
      this.logger.error(`Failed to start service: ${error}`);
      this.emit('startError', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Queue Consumer Service');
    
    this.isRunning = false;
    
    // Stop metrics collection
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    // Stop error handler
    this.errorHandler.stop();
    
    // Disconnect from Redis
    await this.redisConsumer.disconnect();
    
    // Disconnect from InfluxDB
    await this.influxdbClient.disconnect();
    
    this.logger.info('Queue Consumer Service stopped');
    this.emit('stopped');
  }

  private async processMessage(message: PLCMessage, callback: (error?: Error) => void): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.errorHandler.executeWithRetry({
        operation: async () => {
          // Transform message to data points
          const dataPoints = await this.messageTransformer.transformMessage(message);
          
          // Write data points to InfluxDB
          await this.influxdbClient.writeDataPoints(dataPoints);
          
          this.metrics.dataPointsWritten += dataPoints.length;
        },
        context: `processMessage-${message.id}`,
        message
      });
      
      // Update metrics
      this.metrics.messagesProcessed++;
      const processingTime = Date.now() - startTime;
      this.updateProcessingTimes(processingTime);
      
      this.logger.debug(`Successfully processed message ${message.id} in ${processingTime}ms`);
      callback();
      
    } catch {
      this.metrics.messagesFailedProcessing++;
      this.logger.error(`Failed to process message ${message.id}: ${error}`);
      callback(error as Error);
    }
  }

  private updateProcessingTimes(processingTime: number): void {
    this.processingTimes.push(processingTime);
    
    // Keep only recent processing times (last 1000)
    if (this.processingTimes.length > 1000) {
      this.processingTimes.shift();
    }
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
      this.emit('metrics', this.metrics);
    }, 10000); // Update every 10 seconds
  }

  private updateMetrics(): void {
    this.metrics.uptime = Date.now() - this.startTime.getTime();
    
    // Calculate processing rate (messages per second)
    const timeWindowMs = 60000; // 1 minute
    const recentProcessingTimes = this.processingTimes.filter(time => 
      Date.now() - time < timeWindowMs
    );
    this.metrics.processingRate = recentProcessingTimes.length / (timeWindowMs / 1000);
    
    // Calculate average processing time
    if (this.processingTimes.length > 0) {
      const sum = this.processingTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageProcessingTime = sum / this.processingTimes.length;
    }
    
    // Update connection statuses
    this.metrics.redisConnectionStatus = this.redisConsumer.getStats().isRunning;
    this.metrics.influxdbConnectionStatus = this.influxdbClient.getStats().isConnected;
    
    this.logger.debug('Service metrics updated', this.metrics);
  }

  private async handleShutdown(signal: string): Promise<void> {
    this.logger.info(`Received ${signal}, initiating graceful shutdown`);
    
    const shutdownTimeout = setTimeout(() => {
      this.logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, this.config.gracefulShutdownTimeout);
    
    try {
      await this.stop();
      clearTimeout(shutdownTimeout);
      process.exit(0);
    } catch {
      this.logger.error(`Error during shutdown: ${error}`);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }

  getServiceMetrics(): ServiceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  getDetailedStats(): {
    service: ServiceMetrics;
    redis: unknown;
    influxdb: unknown;
    transformer: unknown;
    errorHandler: unknown;
  } {
    return {
      service: this.getServiceMetrics(),
      redis: this.redisConsumer.getStats(),
      influxdb: this.influxdbClient.getStats(),
      transformer: this.messageTransformer.getTransformationStats(),
      errorHandler: this.errorHandler.getErrorStats()
    };
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }

  async performHealthCheck(): Promise<{
    healthy: boolean;
    checks: Record<string, boolean>;
    message: string;
  }> {
    const checks = {
      redis: this.metrics.redisConnectionStatus,
      influxdb: this.metrics.influxdbConnectionStatus,
      circuitBreaker: !this.errorHandler.isCircuitBreakerOpen(),
      processing: this.metrics.processingRate > 0 || this.metrics.messagesProcessed === 0
    };
    
    const healthy = Object.values(checks).every(check => check);
    
    return {
      healthy,
      checks,
      message: healthy ? 'Service is healthy' : 'Service has issues'
    };
  }

  async forceFlushInfluxDB(): Promise<void> {
    await this.influxdbClient.forceFlush();
  }
}