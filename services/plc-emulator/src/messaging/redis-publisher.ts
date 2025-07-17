import { createClient, RedisClientType } from 'redis';
import { PLCMessage, QueueConfig } from '@factory-dashboard/shared-types';
import { EventEmitter } from 'events';
import { createLogger } from 'winston';

export interface RedisPublisherConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  maxRetries: number;
  retryDelay: number;
  connectionPoolSize: number;
}

export class RedisPublisher extends EventEmitter {
  private client: RedisClientType;
  private config: RedisPublisherConfig;
  private logger: ReturnType<typeof createLogger>;
  private messageBuffer: PLCMessage[] = [];
  private isConnected: boolean = false;
  private retryAttempts: number = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: RedisPublisherConfig) {
    super();
    this.config = config;
    this.logger = createLogger({
      level: 'info',
      format: require('winston').format.json(),
      transports: [
        new (require('winston').transports.Console)()
      ]
    });

    this.client = createClient({
      socket: {
        host: config.host,
        port: config.port
      },
      password: config.password,
      database: config.database || 0
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.logger.info('Redis client connected');
      this.isConnected = true;
      this.retryAttempts = 0;
      this.emit('connected');
      this.flushMessageBuffer();
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis client error: ${error}`);
      this.isConnected = false;
      this.emit('error', error);
      this.scheduleReconnect();
    });

    this.client.on('end', () => {
      this.logger.info('Redis client disconnected');
      this.isConnected = false;
      this.emit('disconnected');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.info('Successfully connected to Redis');
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    await this.client.quit();
    this.logger.info('Disconnected from Redis');
  }

  async publishMessage(queueName: string, message: PLCMessage): Promise<void> {
    if (!this.isConnected) {
      this.bufferMessage(message);
      return;
    }

    try {
      const serializedMessage = JSON.stringify(message);
      await this.client.xAdd(queueName, '*', { message: serializedMessage });
      this.logger.debug(`Published message to stream ${queueName}: ${message.id}`);
    } catch (error) {
      this.logger.error(`Failed to publish message: ${error}`);
      this.bufferMessage(message);
      throw error;
    }
  }

  async publishBatch(queueName: string, messages: PLCMessage[]): Promise<void> {
    if (!this.isConnected) {
      this.bufferMessages(messages);
      return;
    }

    try {
      for (const message of messages) {
        const serializedMessage = JSON.stringify(message);
        await this.client.xAdd(queueName, '*', { message: serializedMessage });
      }
      this.logger.debug(`Published batch of ${messages.length} messages to stream ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to publish batch: ${error}`);
      this.bufferMessages(messages);
      throw error;
    }
  }

  private bufferMessage(message: PLCMessage): void {
    this.messageBuffer.push(message);
    this.logger.debug(`Buffered message ${message.id}, buffer size: ${this.messageBuffer.length}`);
    
    // Prevent buffer from growing too large
    if (this.messageBuffer.length > 10000) {
      this.messageBuffer.shift();
      this.logger.warn('Message buffer overflow, oldest message discarded');
    }
  }

  private bufferMessages(messages: PLCMessage[]): void {
    this.messageBuffer.push(...messages);
    this.logger.debug(`Buffered ${messages.length} messages, buffer size: ${this.messageBuffer.length}`);
    
    // Prevent buffer from growing too large
    while (this.messageBuffer.length > 10000) {
      this.messageBuffer.shift();
    }
  }

  private async flushMessageBuffer(): Promise<void> {
    if (this.messageBuffer.length === 0) {
      return;
    }

    this.logger.info(`Flushing ${this.messageBuffer.length} buffered messages`);
    
    const messagesToFlush = [...this.messageBuffer];
    this.messageBuffer = [];

    try {
      // Group messages by equipment for better organization
      const messagesByEquipment = new Map<string, PLCMessage[]>();
      
      for (const message of messagesToFlush) {
        const equipmentId = message.equipmentId;
        if (!messagesByEquipment.has(equipmentId)) {
          messagesByEquipment.set(equipmentId, []);
        }
        messagesByEquipment.get(equipmentId)!.push(message);
      }

      // Publish each equipment's messages to its queue
      for (const [equipmentId, messages] of messagesByEquipment) {
        const queueName = `plc_data_${equipmentId}`;
        await this.publishBatch(queueName, messages);
      }

      this.logger.info('Successfully flushed buffered messages');
    } catch (error) {
      this.logger.error(`Failed to flush buffered messages: ${error}`);
      // Put messages back in buffer for retry
      this.messageBuffer.unshift(...messagesToFlush);
    }
  }

  private scheduleReconnect(): void {
    if (this.retryAttempts >= this.config.maxRetries) {
      this.logger.error('Max retry attempts reached, giving up');
      return;
    }

    const delay = this.config.retryDelay * Math.pow(2, this.retryAttempts);
    this.retryAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      this.logger.info(`Attempting to reconnect (attempt ${this.retryAttempts}/${this.config.maxRetries})`);
      try {
        await this.connect();
      } catch (error) {
        this.logger.error(`Reconnection attempt failed: ${error}`);
        this.scheduleReconnect();
      }
    }, delay);
  }

  getBufferSize(): number {
    return this.messageBuffer.length;
  }

  isConnectedToRedis(): boolean {
    return this.isConnected;
  }
}