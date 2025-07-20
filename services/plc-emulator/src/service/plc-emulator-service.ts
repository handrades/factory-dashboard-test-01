import { EventEmitter } from 'events';
import { EquipmentConfig, PLCMessage, FactoryLogger, createFactoryLogger, MetricsCollector, MetricsRegistry } from '@factory-dashboard/shared-types';
import { LineConfigLoader } from '../config/line-config-loader';
import { EquipmentSimulator } from '../simulation/equipment-simulator';
import { RedisPublisher, RedisPublisherConfig } from '../messaging/redis-publisher';
import { MessageFormatter } from '../messaging/message-formatter';

export interface PLCEmulatorServiceConfig {
  configDirectory: string;
  updateInterval: number;
  heartbeatInterval: number;
  redis: RedisPublisherConfig;
  enableHealthChecks: boolean;
  gracefulShutdownTimeout: number;
}

export interface ServiceStats {
  uptime: number;
  messagesPublished: number;
  equipmentCount: number;
  lastUpdateTime: Date;
  isConnectedToRedis: boolean;
  bufferSize: number;
}

export class PLCEmulatorService extends EventEmitter {
  private config: PLCEmulatorServiceConfig;
  private logger: FactoryLogger;
  private metrics: MetricsCollector;
  private configLoader: LineConfigLoader;
  private redisPublisher: RedisPublisher;
  private messageFormatter: MessageFormatter;
  private equipmentSimulators: Map<string, EquipmentSimulator> = new Map();
  private equipmentMetadata: Map<string, { site: string; productType: string; lineNumber: number }> = new Map();
  
  private updateTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  
  private isRunning: boolean = false;
  private startTime: Date = new Date();
  private messagesPublished: number = 0;
  private lastUpdateTime: Date = new Date();

  constructor(config: PLCEmulatorServiceConfig) {
    super();
    this.config = config;
    
    this.logger = createFactoryLogger('plc-emulator');
    this.metrics = MetricsRegistry.getCollector('plc-emulator');

    this.configLoader = new LineConfigLoader({
      configDirectory: config.configDirectory,
      watchForChanges: true
    });

    this.redisPublisher = new RedisPublisher(config.redis);
    this.messageFormatter = new MessageFormatter();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Configuration reload handling
    this.configLoader.on('configReloaded', (newConfig: EquipmentConfig[]) => {
      this.logger.info('Configuration reloaded, updating simulators');
      this.updateSimulators(newConfig);
    });

    this.configLoader.on('configError', (error: Error) => {
      this.logger.error(`Configuration error: ${error.message}`);
      this.emit('configError', error);
    });

    // Redis connection handling
    this.redisPublisher.on('connected', () => {
      this.logger.info('Connected to Redis');
      this.emit('redisConnected');
    });

    this.redisPublisher.on('disconnected', () => {
      this.logger.warn('Disconnected from Redis');
      this.emit('redisDisconnected');
    });

    this.redisPublisher.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`);
      this.emit('redisError', error);
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGUSR2', () => this.handleShutdown('SIGUSR2')); // For nodemon
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting PLC Emulator Service');
      
      // Load initial configuration
      const equipmentConfigs = await this.configLoader.loadConfiguration();
      this.updateSimulators(equipmentConfigs);
      
      // Connect to Redis
      await this.redisPublisher.connect();
      
      // Start main update loop
      this.startUpdateLoop();
      
      // Start heartbeat loop
      this.startHeartbeatLoop();
      
      // Start health checks
      if (this.config.enableHealthChecks) {
        this.startHealthChecks();
      }
      
      this.isRunning = true;
      this.startTime = new Date();
      
      this.logger.info('PLC Emulator Service started successfully');
      this.emit('started');
      
    } catch {
      this.logger.error(`Failed to start service: ${error}`);
      this.emit('startError', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping PLC Emulator Service');
    
    this.isRunning = false;
    
    // Clear all timers
    if (this.updateTimer) clearInterval(this.updateTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    
    // Stop configuration watching
    this.configLoader.stopWatching();
    
    // Disconnect from Redis
    await this.redisPublisher.disconnect();
    
    this.logger.info('PLC Emulator Service stopped');
    this.emit('stopped');
  }

  private updateSimulators(equipmentConfigs: EquipmentConfig[]): void {
    // Remove simulators for equipment that no longer exists
    for (const [equipmentId] of this.equipmentSimulators) {
      if (!equipmentConfigs.find(config => config.id === equipmentId)) {
        this.equipmentSimulators.delete(equipmentId);
        this.equipmentMetadata.delete(equipmentId);
        this.logger.info(`Removed simulator for equipment: ${equipmentId}`);
      }
    }

    // Add or update simulators for current equipment
    for (const config of equipmentConfigs) {
      // Store metadata for this equipment
      this.equipmentMetadata.set(config.id, {
        site: config.site,
        productType: config.productType,
        lineNumber: config.lineNumber
      });

      if (this.equipmentSimulators.has(config.id)) {
        // Update existing simulator with new configuration
        const simulator = new EquipmentSimulator(config);
        this.setupSimulatorEventHandlers(simulator, config);
        this.equipmentSimulators.set(config.id, simulator);
        this.logger.info(`Updated simulator for equipment: ${config.id}`);
      } else {
        // Create new simulator
        const simulator = new EquipmentSimulator(config);
        this.setupSimulatorEventHandlers(simulator, config);
        this.equipmentSimulators.set(config.id, simulator);
        this.logger.info(`Created simulator for equipment: ${config.id}`);
      }
    }
  }

  private setupSimulatorEventHandlers(simulator: EquipmentSimulator, config: EquipmentConfig): void {
    simulator.on('stateChanged', async (event) => {
      const message = this.messageFormatter.createStateChangeMessage(
        event.equipmentId,
        config.site,
        config.productType,
        config.lineNumber,
        event.previousState,
        event.currentState
      );
      
      await this.publishMessage(message);
    });
  }

  private startUpdateLoop(): void {
    this.updateTimer = setInterval(async () => {
      await this.performUpdate();
    }, this.config.updateInterval);
  }

  private startHeartbeatLoop(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeats();
    }, this.config.heartbeatInterval);
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  private async performUpdate(): Promise<void> {
    try {
      this.lastUpdateTime = new Date();
      
      for (const [equipmentId, simulator] of this.equipmentSimulators) {
        // Check for state transitions
        simulator.checkStateTransitions();
        
        // Generate tag values
        const tagValues = simulator.generateTagValues();
        
        // Get metadata for this equipment
        const metadata = this.equipmentMetadata.get(equipmentId);
        if (!metadata) {
          this.logger.error(`No metadata found for equipment: ${equipmentId}`);
          continue;
        }
        
        // Create and publish message
        const message = this.messageFormatter.createPLCMessage(
          equipmentId,
          metadata.site,
          metadata.productType,
          metadata.lineNumber,
          tagValues,
          'DATA_UPDATE'
        );
        
        await this.publishMessage(message);
      }
      
    } catch {
      this.logger.error(`Error during update: ${error}`);
      this.emit('updateError', error);
    }
  }

  private async sendHeartbeats(): Promise<void> {
    try {
      for (const equipmentId of this.equipmentSimulators.keys()) {
        // Get metadata for this equipment
        const metadata = this.equipmentMetadata.get(equipmentId);
        if (!metadata) {
          this.logger.error(`No metadata found for equipment: ${equipmentId}`);
          continue;
        }
        
        const heartbeatMessage = this.messageFormatter.createHeartbeatMessage(
          equipmentId,
          metadata.site,
          metadata.productType,
          metadata.lineNumber
        );
        await this.publishMessage(heartbeatMessage);
      }
    } catch {
      this.logger.error(`Error sending heartbeats: ${error}`);
    }
  }

  private async publishMessage(message: PLCMessage): Promise<void> {
    try {
      const validation = this.messageFormatter.validateMessage(message);
      
      if (!validation.isValid) {
        this.logger.error(`Invalid message: ${validation.errors.join(', ')}`);
        return;
      }
      
      const queueName = `plc_data_${message.equipmentId}`;
      await this.redisPublisher.publishMessage(queueName, message);
      
      this.messagesPublished++;
      
    } catch {
      this.logger.error(`Failed to publish message: ${error}`);
    }
  }

  private performHealthCheck(): void {
    const stats = this.getServiceStats();
    
    this.logger.debug('Health check', stats);
    this.emit('healthCheck', stats);
    
    // Check for potential issues
    if (!stats.isConnectedToRedis) {
      this.logger.warn('Health check: Not connected to Redis');
    }
    
    if (stats.bufferSize > 1000) {
      this.logger.warn(`Health check: Large message buffer (${stats.bufferSize})`);
    }
    
    const timeSinceLastUpdate = Date.now() - stats.lastUpdateTime.getTime();
    if (timeSinceLastUpdate > this.config.updateInterval * 2) {
      this.logger.warn('Health check: Updates are lagging');
    }
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

  getServiceStats(): ServiceStats {
    return {
      uptime: Date.now() - this.startTime.getTime(),
      messagesPublished: this.messagesPublished,
      equipmentCount: this.equipmentSimulators.size,
      lastUpdateTime: this.lastUpdateTime,
      isConnectedToRedis: this.redisPublisher.isConnectedToRedis(),
      bufferSize: this.redisPublisher.getBufferSize()
    };
  }

  getEquipmentStatus(): { [equipmentId: string]: string } {
    const status: { [equipmentId: string]: string } = {};
    
    for (const [equipmentId, simulator] of this.equipmentSimulators) {
      status[equipmentId] = simulator.getCurrentState();
    }
    
    return status;
  }

  forceEquipmentStateTransition(equipmentId: string, stateName: string): boolean {
    const simulator = this.equipmentSimulators.get(equipmentId);
    
    if (!simulator) {
      this.logger.error(`Equipment not found: ${equipmentId}`);
      return false;
    }
    
    try {
      simulator.forceStateTransition(stateName);
      this.logger.info(`Forced state transition for ${equipmentId} to ${stateName}`);
      return true;
    } catch {
      this.logger.error(`Failed to force state transition: ${error}`);
      return false;
    }
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }
}