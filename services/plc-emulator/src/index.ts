import { PLCEmulatorService, PLCEmulatorServiceConfig } from './service/plc-emulator-service';
import { resolve } from 'path';

// Load configuration from environment variables or use defaults
const config: PLCEmulatorServiceConfig = {
  configDirectory: process.env.CONFIG_DIRECTORY || resolve(__dirname, '../../../infrastructure/config'),
  updateInterval: parseInt(process.env.UPDATE_INTERVAL || '2000', 10),
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10),
  gracefulShutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10),
  enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    database: parseInt(process.env.REDIS_DATABASE || '0', 10),
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '5', 10),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
    connectionPoolSize: parseInt(process.env.REDIS_POOL_SIZE || '10', 10)
  }
};

async function main() {
  const service = new PLCEmulatorService(config);
  
  // Set up event handlers for monitoring
  service.on('started', () => {
    console.log('PLC Emulator Service started successfully');
    
    // Log service stats periodically
    setInterval(() => {
      const stats = service.getServiceStats();
      console.log('Service Stats:', {
        uptime: Math.round(stats.uptime / 1000) + 's',
        messagesPublished: stats.messagesPublished,
        equipmentCount: stats.equipmentCount,
        redisConnected: stats.isConnectedToRedis,
        bufferSize: stats.bufferSize
      });
    }, 60000); // Every minute
  });
  
  service.on('stopped', () => {
    console.log('PLC Emulator Service stopped');
  });
  
  service.on('startError', (error) => {
    console.error('Failed to start service:', error);
    process.exit(1);
  });
  
  service.on('configError', (error) => {
    console.error('Configuration error:', error);
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
  
  service.on('updateError', (error) => {
    console.error('Update error:', error);
  });
  
  service.on('healthCheck', (stats) => {
    // Log warnings for unhealthy conditions
    if (!stats.isConnectedToRedis) {
      console.warn('WARNING: Not connected to Redis');
    }
    if (stats.bufferSize > 1000) {
      console.warn(`WARNING: Large message buffer (${stats.bufferSize})`);
    }
  });
  
  try {
    await service.start();
  } catch {
    console.error('Failed to start PLC Emulator Service:', error);
    process.exit(1);
  }
}

// Start the service
main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});