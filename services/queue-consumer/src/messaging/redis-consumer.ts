import { createClient, RedisClientType } from 'redis';
import { PLCMessage, ConsumerConfig } from '@factory-dashboard/shared-types';
import { EventEmitter } from 'events';
import { createLogger } from 'winston';

export interface RedisConsumerConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  maxRetries: number;
  retryDelay: number;
  consumerGroup: string;
  consumerId: string;
  deadLetterQueue: string;
  processingTimeout: number;
}

export interface MessageProcessingResult {
  success: boolean;
  messageId: string;
  error?: string;
  processingTime: number;
}

export class RedisConsumer extends EventEmitter {
  private client: RedisClientType;
  private config: RedisConsumerConfig;
  private logger: ReturnType<typeof createLogger>;
  private isRunning: boolean = false;
  private processingMessages: Map<string, NodeJS.Timeout> = new Map();
  private messagesProcessed: number = 0;
  private messagesFailedProcessing: number = 0;
  private reconnectAttempts: number = 0;

  constructor(config: RedisConsumerConfig) {
    super();
    this.config = config;
    this.logger = createLogger({
      level: 'info',
      format: require('winston').format.combine(
        require('winston').format.timestamp(),
        require('winston').format.json()
      ),
      transports: [
        new (require('winston').transports.Console)(),
        new (require('winston').transports.File)({ filename: 'queue-consumer.log' })
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
      this.logger.info('Redis consumer connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis consumer error: ${error}`);
      this.emit('error', error);
    });

    this.client.on('end', () => {
      this.logger.info('Redis consumer disconnected');
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
    this.isRunning = false;
    
    // Wait for currently processing messages to complete
    await this.waitForProcessingToComplete();
    
    await this.client.quit();
    this.logger.info('Disconnected from Redis');
  }

  async startConsuming(queueNames: string[], consumerConfig: ConsumerConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error('Consumer is already running');
    }

    this.isRunning = true;
    this.logger.info(`Starting to consume from queues: ${queueNames.join(', ')}`);

    try {
      // Create consumer group if it doesn't exist
      for (const queueName of queueNames) {
        await this.createConsumerGroup(queueName);
      }

      // Start consuming messages
      this.consumeMessages(queueNames, consumerConfig);
      
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  private async createConsumerGroup(queueName: string): Promise<void> {
    try {
      await this.client.xGroupCreate(
        queueName,
        this.config.consumerGroup,
        '0',
        { MKSTREAM: true }
      );
      this.logger.info(`Created consumer group ${this.config.consumerGroup} for queue ${queueName}`);
    } catch (error: any) {
      if (error.message.includes('BUSYGROUP')) {
        this.logger.debug(`Consumer group ${this.config.consumerGroup} already exists for queue ${queueName}`);
      } else {
        throw error;
      }
    }
  }

  private async consumeMessages(queueNames: string[], consumerConfig: ConsumerConfig): Promise<void> {
    while (this.isRunning) {
      try {
        // Read messages from streams
        const streamReads = queueNames.map(queueName => ({
          key: queueName,
          id: '>'
        }));

        const result = await this.client.xReadGroup(
          this.config.consumerGroup,
          this.config.consumerId,
          streamReads,
          {
            COUNT: consumerConfig.batchSize,
            BLOCK: consumerConfig.visibilityTimeout
          }
        );

        if (result && result.length > 0) {
          await this.processMessages(result, consumerConfig);
        }

        // Process pending messages (messages that timed out)
        await this.processPendingMessages(queueNames, consumerConfig);
        
      } catch (error) {
        this.logger.error(`Error consuming messages: ${error}`);
        await this.sleep(1000);
      }
    }
  }

  private async processMessages(streamResults: any[], consumerConfig: ConsumerConfig): Promise<void> {
    for (const streamResult of streamResults) {
      const queueName = streamResult.name;
      const messages = streamResult.messages;

      for (const message of messages) {
        if (this.processingMessages.size >= consumerConfig.concurrency) {
          // Wait for some messages to complete processing
          await this.waitForProcessingSlot();
        }

        this.processMessage(queueName, message.id, message.message, consumerConfig);
      }
    }
  }

  private async processMessage(
    queueName: string,
    messageId: string,
    messageData: any,
    consumerConfig: ConsumerConfig
  ): Promise<void> {
    const startTime = Date.now();
    
    // Set processing timeout
    const timeoutId = setTimeout(() => {
      this.logger.warn(`Message ${messageId} processing timeout`);
      this.processingMessages.delete(messageId);
      this.messagesFailedProcessing++;
    }, consumerConfig.processingTimeout);

    this.processingMessages.set(messageId, timeoutId);

    try {
      // Parse message
      const plcMessage = this.parseMessage(messageData);
      
      // Emit message for processing
      const processingPromise = new Promise<MessageProcessingResult>((resolve, reject) => {
        this.emit('message', plcMessage, (error?: Error) => {
          const processingTime = Date.now() - startTime;
          
          if (error) {
            resolve({
              success: false,
              messageId,
              error: error.message,
              processingTime
            });
          } else {
            resolve({
              success: true,
              messageId,
              processingTime
            });
          }
        });
      });

      const result = await processingPromise;
      
      if (result.success) {
        // Acknowledge message
        await this.client.xAck(queueName, this.config.consumerGroup, messageId);
        this.messagesProcessed++;
        this.logger.debug(`Message ${messageId} processed successfully in ${result.processingTime}ms`);
      } else {
        // Handle failed message
        await this.handleFailedMessage(queueName, messageId, plcMessage, result.error);
        this.messagesFailedProcessing++;
      }

    } catch (error) {
      this.logger.error(`Error processing message ${messageId}: ${error}`);
      await this.handleFailedMessage(queueName, messageId, null, error?.toString());
      this.messagesFailedProcessing++;
    } finally {
      clearTimeout(timeoutId);
      this.processingMessages.delete(messageId);
    }
  }

  private parseMessage(messageData: any): PLCMessage {
    try {
      const messageJson = messageData.message || messageData;
      const parsedMessage = JSON.parse(messageJson);
      
      // Convert timestamp string back to Date
      if (typeof parsedMessage.timestamp === 'string') {
        parsedMessage.timestamp = new Date(parsedMessage.timestamp);
      }
      
      return parsedMessage;
    } catch (error) {
      throw new Error(`Failed to parse message: ${error}`);
    }
  }

  private async handleFailedMessage(
    queueName: string,
    messageId: string,
    message: PLCMessage | null,
    error?: string
  ): Promise<void> {
    this.logger.error(`Message ${messageId} failed processing: ${error}`);
    
    try {
      // Send to dead letter queue
      await this.client.xAdd(this.config.deadLetterQueue, '*', {
        originalQueue: queueName,
        originalMessageId: messageId,
        message: message ? JSON.stringify(message) : 'PARSE_ERROR',
        error: error || 'Unknown error',
        timestamp: new Date().toISOString()
      });

      // Acknowledge original message to remove it from pending
      await this.client.xAck(queueName, this.config.consumerGroup, messageId);
      
    } catch (deadLetterError) {
      this.logger.error(`Failed to send message to dead letter queue: ${deadLetterError}`);
    }
  }

  private async processPendingMessages(queueNames: string[], consumerConfig: ConsumerConfig): Promise<void> {
    for (const queueName of queueNames) {
      try {
        const pendingMessages = await this.client.xPending(
          queueName,
          this.config.consumerGroup
        );

        if (pendingMessages && pendingMessages.pending > 0) {
          // Get pending message details
          const pendingDetails = await this.client.xPendingRange(
            queueName,
            this.config.consumerGroup,
            '-',
            '+',
            10
          );
          
          for (const pendingMessage of pendingDetails || []) {
            const messageId = pendingMessage.id;
            const idleTime = pendingMessage.millisecondsSinceLastDelivery;
            
            // Reclaim messages that have been idle for too long
            if (idleTime > consumerConfig.processingTimeout) {
              await this.reclaimMessage(queueName, messageId, consumerConfig);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error processing pending messages for queue ${queueName}: ${error}`);
      }
    }
  }

  private async reclaimMessage(queueName: string, messageId: string, consumerConfig: ConsumerConfig): Promise<void> {
    try {
      const claimedMessages = await this.client.xClaim(
        queueName,
        this.config.consumerGroup,
        this.config.consumerId,
        consumerConfig.processingTimeout,
        messageId
      );

      if (claimedMessages && claimedMessages.length > 0) {
        for (const message of claimedMessages) {
          if (message?.id && message?.message) {
            this.processMessage(queueName, message.id, message.message, consumerConfig);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error reclaiming message ${messageId}: ${error}`);
    }
  }

  private async waitForProcessingSlot(): Promise<void> {
    while (this.processingMessages.size >= 10) { // Wait if too many messages are processing
      await this.sleep(100);
    }
  }

  private async waitForProcessingToComplete(): Promise<void> {
    while (this.processingMessages.size > 0) {
      this.logger.info(`Waiting for ${this.processingMessages.size} messages to complete processing`);
      await this.sleep(1000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): {
    messagesProcessed: number;
    messagesFailedProcessing: number;
    currentlyProcessing: number;
    isRunning: boolean;
  } {
    return {
      messagesProcessed: this.messagesProcessed,
      messagesFailedProcessing: this.messagesFailedProcessing,
      currentlyProcessing: this.processingMessages.size,
      isRunning: this.isRunning
    };
  }
}