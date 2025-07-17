export interface QueueMessage {
  id: string;
  timestamp: Date;
  payload: any;
  retryCount: number;
  maxRetries: number;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  expiresAt?: Date;
}

export interface QueueConfig {
  name: string;
  maxSize: number;
  ttl: number;
  deadLetterQueue?: string;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
    maxDelay: number;
  };
}

export interface ConsumerConfig {
  queueName: string;
  concurrency: number;
  batchSize: number;
  visibilityTimeout: number;
  processingTimeout: number;
}