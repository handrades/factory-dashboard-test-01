import { PLCMessage, PLCTag } from '@factory-dashboard/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from 'winston';

export class MessageFormatter {
  private logger: ReturnType<typeof createLogger>;
  private processedMessageIds: Set<string> = new Set();
  private messageIdTTL: number = 300000; // 5 minutes

  constructor() {
    this.logger = createLogger({
      level: 'info',
      format: require('winston').format.json(),
      transports: [
        new (require('winston').transports.Console)()
      ]
    });

    // Clean up old message IDs periodically
    setInterval(() => {
      this.cleanupOldMessageIds();
    }, this.messageIdTTL);
  }

  createPLCMessage(
    equipmentId: string,
    site: string,
    productType: string,
    lineNumber: number,
    tags: PLCTag[],
    messageType: 'DATA_UPDATE' | 'STATE_CHANGE' | 'ALARM' | 'HEARTBEAT' = 'DATA_UPDATE'
  ): PLCMessage {
    const messageId = this.generateMessageId();
    
    const message: PLCMessage = {
      id: messageId,
      timestamp: new Date(),
      equipmentId,
      site,
      productType,
      lineNumber,
      messageType,
      tags: tags.map(tag => ({
        tagId: tag.id,
        value: tag.value,
        quality: tag.quality
      }))
    };

    return message;
  }

  createStateChangeMessage(
    equipmentId: string,
    site: string,
    productType: string,
    lineNumber: number,
    previousState: string,
    currentState: string
  ): PLCMessage {
    const messageId = this.generateMessageId();
    
    const message: PLCMessage = {
      id: messageId,
      timestamp: new Date(),
      equipmentId,
      site,
      productType,
      lineNumber,
      messageType: 'STATE_CHANGE',
      tags: [
        {
          tagId: 'previous_state',
          value: previousState,
          quality: 'GOOD'
        },
        {
          tagId: 'current_state',
          value: currentState,
          quality: 'GOOD'
        }
      ]
    };

    return message;
  }

  createHeartbeatMessage(
    equipmentId: string,
    site: string,
    productType: string,
    lineNumber: number
  ): PLCMessage {
    const messageId = this.generateMessageId();
    
    const message: PLCMessage = {
      id: messageId,
      timestamp: new Date(),
      equipmentId,
      site,
      productType,
      lineNumber,
      messageType: 'HEARTBEAT',
      tags: [
        {
          tagId: 'heartbeat',
          value: true,
          quality: 'GOOD'
        }
      ]
    };

    return message;
  }

  createAlarmMessage(
    equipmentId: string,
    site: string,
    productType: string,
    lineNumber: number,
    alarmType: string,
    alarmMessage: string
  ): PLCMessage {
    const messageId = this.generateMessageId();
    
    const message: PLCMessage = {
      id: messageId,
      timestamp: new Date(),
      equipmentId,
      site,
      productType,
      lineNumber,
      messageType: 'ALARM',
      tags: [
        {
          tagId: 'alarm_type',
          value: alarmType,
          quality: 'GOOD'
        },
        {
          tagId: 'alarm_message',
          value: alarmMessage,
          quality: 'GOOD'
        }
      ]
    };

    return message;
  }

  validateMessage(message: PLCMessage): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!message.id) {
      errors.push('Message ID is required');
    }

    if (!message.timestamp) {
      errors.push('Timestamp is required');
    } else if (!(message.timestamp instanceof Date)) {
      errors.push('Timestamp must be a Date object');
    }

    if (!message.equipmentId) {
      errors.push('Equipment ID is required');
    }

    if (!message.messageType) {
      errors.push('Message type is required');
    } else if (!['DATA_UPDATE', 'STATE_CHANGE', 'ALARM', 'HEARTBEAT'].includes(message.messageType)) {
      errors.push('Invalid message type');
    }

    if (!message.tags || !Array.isArray(message.tags)) {
      errors.push('Tags array is required');
    } else {
      // Validate each tag
      message.tags.forEach((tag, index) => {
        if (!tag.tagId) {
          errors.push(`Tag ${index}: tagId is required`);
        }

        if (tag.value === undefined) {
          errors.push(`Tag ${index}: value is required`);
        }

        if (!tag.quality || !['GOOD', 'BAD', 'UNCERTAIN'].includes(tag.quality)) {
          errors.push(`Tag ${index}: invalid quality value`);
        }
      });
    }

    // Check for duplicate message ID
    if (this.processedMessageIds.has(message.id)) {
      errors.push('Duplicate message ID detected');
    }

    const isValid = errors.length === 0;
    
    if (isValid) {
      this.processedMessageIds.add(message.id);
    }

    return { isValid, errors };
  }

  serializeMessage(message: PLCMessage): string {
    try {
      return JSON.stringify(message);
    } catch (error) {
      this.logger.error(`Failed to serialize message: ${error}`);
      throw new Error('Message serialization failed');
    }
  }

  deserializeMessage(serializedMessage: string): PLCMessage {
    try {
      const message = JSON.parse(serializedMessage);
      
      // Convert timestamp string back to Date object
      if (typeof message.timestamp === 'string') {
        message.timestamp = new Date(message.timestamp);
      }

      return message;
    } catch (error) {
      this.logger.error(`Failed to deserialize message: ${error}`);
      throw new Error('Message deserialization failed');
    }
  }

  private generateMessageId(): string {
    return uuidv4();
  }

  private cleanupOldMessageIds(): void {
    // For simplicity, we'll clear all message IDs periodically
    // In a production system, you'd want to track timestamps and remove only old ones
    const oldSize = this.processedMessageIds.size;
    this.processedMessageIds.clear();
    
    if (oldSize > 0) {
      this.logger.debug(`Cleaned up ${oldSize} old message IDs`);
    }
  }

  getProcessedMessageCount(): number {
    return this.processedMessageIds.size;
  }
}