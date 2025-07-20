import { EventEmitter } from 'events';
import winston, { createLogger } from 'winston';
import { PLCMessage } from '@factory-dashboard/shared-types';

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterMax: number;
}

export interface ErrorHandlerConfig {
  retryConfig: RetryConfig;
  deadLetterQueueName: string;
  enableHealthChecks: boolean;
  alertThresholds: {
    errorRate: number;
    consecutiveFailures: number;
    responseTime: number;
  };
}

export interface ProcessingError {
  message: PLCMessage;
  error: Error;
  timestamp: Date;
  attempt: number;
  processingTime: number;
}

export interface RetryableOperation<T> {
  operation: () => Promise<T>;
  context: string;
  message?: PLCMessage;
}

export class ErrorHandler extends EventEmitter {
  private config: ErrorHandlerConfig;
  private logger: ReturnType<typeof createLogger>;
  private errorStats: {
    totalErrors: number;
    retriedErrors: number;
    deadLetterMessages: number;
    consecutiveFailures: number;
    lastErrorTime: Date | null;
  } = {
    totalErrors: 0,
    retriedErrors: 0,
    deadLetterMessages: 0,
    consecutiveFailures: 0,
    lastErrorTime: null
  };

  private recentErrors: ProcessingError[] = [];
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerOpenTime: Date | null = null;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: ErrorHandlerConfig) {
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
        new winston.transports.File({ filename: 'error-handler.log' })
      ]
    });

    if (config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  async executeWithRetry<T>(operation: RetryableOperation<T>): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retryConfig.maxRetries + 1; attempt++) {
      try {
        // Check circuit breaker
        if (this.circuitBreakerOpen && !this.shouldAttemptCircuitBreakerReset()) {
          throw new Error('Circuit breaker is open');
        }

        const result = await operation.operation();
        
        // Reset consecutive failures on success
        this.errorStats.consecutiveFailures = 0;
        
        // Close circuit breaker on success
        if (this.circuitBreakerOpen) {
          this.closeCircuitBreaker();
        }
        
        return result;
        
      } catch {
        lastError = error as Error;
        const processingTime = Date.now() - startTime;
        
        this.recordError({
          message: operation.message!,
          error: lastError,
          timestamp: new Date(),
          attempt,
          processingTime
        });

        if (attempt <= this.config.retryConfig.maxRetries) {
          this.logger.warn(`Attempt ${attempt} failed for ${operation.context}, retrying...`, {
            error: lastError.message,
            attempt,
            context: operation.context
          });
          
          await this.delay(this.calculateDelay(attempt));
        } else {
          this.logger.error(`All ${this.config.retryConfig.maxRetries} retry attempts failed for ${operation.context}`, {
            error: lastError.message,
            context: operation.context
          });
          
          await this.handleFailedMessage(operation.message!, lastError);
          break;
        }
      }
    }
    
    throw lastError;
  }

  private recordError(error: ProcessingError): void {
    this.errorStats.totalErrors++;
    this.errorStats.consecutiveFailures++;
    this.errorStats.lastErrorTime = error.timestamp;
    
    // Keep recent errors for analysis (limit to last 100)
    this.recentErrors.push(error);
    if (this.recentErrors.length > 100) {
      this.recentErrors.shift();
    }

    // Check if circuit breaker should be opened
    this.checkCircuitBreaker();
    
    // Emit error event
    this.emit('error', error);
  }

  private checkCircuitBreaker(): void {
    const errorRate = this.calculateErrorRate();
    
    if (errorRate > this.config.alertThresholds.errorRate || 
        this.errorStats.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      
      this.openCircuitBreaker();
    }
  }

  private openCircuitBreaker(): void {
    if (!this.circuitBreakerOpen) {
      this.circuitBreakerOpen = true;
      this.circuitBreakerOpenTime = new Date();
      
      this.logger.error('Circuit breaker opened due to high error rate', {
        errorRate: this.calculateErrorRate(),
        consecutiveFailures: this.errorStats.consecutiveFailures
      });
      
      this.emit('circuitBreakerOpen', {
        errorRate: this.calculateErrorRate(),
        consecutiveFailures: this.errorStats.consecutiveFailures
      });
    }
  }

  private closeCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.circuitBreakerOpenTime = null;
    
    this.logger.info('Circuit breaker closed - service recovered');
    this.emit('circuitBreakerClosed');
  }

  private shouldAttemptCircuitBreakerReset(): boolean {
    if (!this.circuitBreakerOpenTime) return false;
    
    const resetTimeoutMs = 30000; // 30 seconds
    return Date.now() - this.circuitBreakerOpenTime.getTime() > resetTimeoutMs;
  }

  private calculateErrorRate(): number {
    const timeWindowMs = 60000; // 1 minute
    const cutoffTime = new Date(Date.now() - timeWindowMs);
    
    const recentErrors = this.recentErrors.filter(error => error.timestamp > cutoffTime);
    const totalOperations = Math.max(recentErrors.length * 2, 1); // Estimate total operations
    
    return recentErrors.length / totalOperations;
  }

  private calculateDelay(attempt: number): number {
    const { initialDelay, maxDelay, backoffMultiplier, jitterMax } = this.config.retryConfig;
    
    // Exponential backoff
    let delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
    delay = Math.min(delay, maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * jitterMax;
    delay += jitter;
    
    return delay;
  }

  private async handleFailedMessage(message: PLCMessage, error: Error): Promise<void> {
    try {
      this.errorStats.deadLetterMessages++;
      
      // Create dead letter message
      const deadLetterMessage = {
        originalMessage: message,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        timestamp: new Date(),
        attempts: this.config.retryConfig.maxRetries + 1
      };
      
      this.logger.error('Sending message to dead letter queue', {
        messageId: message.id,
        equipmentId: message.equipmentId,
        error: error.message
      });
      
      this.emit('deadLetterMessage', deadLetterMessage);
      
    } catch (deadLetterError) {
      this.logger.error('Failed to handle dead letter message', {
        originalError: error.message,
        deadLetterError: deadLetterError
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  private performHealthCheck(): void {
    const stats = this.getErrorStats();
    const errorRate = this.calculateErrorRate();
    
    this.logger.debug('Error handler health check', {
      ...stats,
      errorRate,
      circuitBreakerOpen: this.circuitBreakerOpen
    });
    
    // Check alert thresholds
    if (errorRate > this.config.alertThresholds.errorRate) {
      this.emit('alert', {
        type: 'HIGH_ERROR_RATE',
        value: errorRate,
        threshold: this.config.alertThresholds.errorRate
      });
    }
    
    if (stats.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      this.emit('alert', {
        type: 'CONSECUTIVE_FAILURES',
        value: stats.consecutiveFailures,
        threshold: this.config.alertThresholds.consecutiveFailures
      });
    }
    
    this.emit('healthCheck', {
      ...stats,
      errorRate,
      circuitBreakerOpen: this.circuitBreakerOpen
    });
  }

  getErrorStats(): {
    totalErrors: number;
    retriedErrors: number;
    deadLetterMessages: number;
    consecutiveFailures: number;
    lastErrorTime: Date | null;
  } {
    return { ...this.errorStats };
  }

  getRecentErrors(count: number = 10): ProcessingError[] {
    return this.recentErrors.slice(-count);
  }

  isCircuitBreakerOpen(): boolean {
    return this.circuitBreakerOpen;
  }

  resetStats(): void {
    this.errorStats = {
      totalErrors: 0,
      retriedErrors: 0,
      deadLetterMessages: 0,
      consecutiveFailures: 0,
      lastErrorTime: null
    };
    this.recentErrors = [];
  }

  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}