import { MessageFormatter } from '../messaging/message-formatter';
import { PLCTag, PLCMessage } from '@factory-dashboard/shared-types';

describe('MessageFormatter', () => {
  let formatter: MessageFormatter;

  beforeEach(() => {
    formatter = new MessageFormatter();
  });

  describe('createPLCMessage', () => {
    const testTags: PLCTag[] = [
      {
        id: 'temperature',
        name: 'Temperature',
        equipmentId: 'oven1',
        dataType: 'REAL',
        address: 'DB1.DBD0',
        value: 350,
        timestamp: new Date(),
        quality: 'GOOD'
      }
    ];

    it('should create a valid PLC message', () => {
      const message = formatter.createPLCMessage('oven1', 'Factory-A', 'Electronics', 1, testTags, 'DATA_UPDATE');
      
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(message.equipmentId).toBe('oven1');
      expect(message.messageType).toBe('DATA_UPDATE');
      expect(message.tags).toHaveLength(1);
      expect(message.tags[0].tagId).toBe('temperature');
      expect(message.tags[0].value).toBe(350);
      expect(message.tags[0].quality).toBe('GOOD');
    });

    it('should default to DATA_UPDATE message type', () => {
      const message = formatter.createPLCMessage('oven1', 'Factory-A', 'Electronics', 1, testTags);
      expect(message.messageType).toBe('DATA_UPDATE');
    });
  });

  describe('createStateChangeMessage', () => {
    it('should create a state change message', () => {
      const message = formatter.createStateChangeMessage('oven1', 'Factory-A', 'Electronics', 1, 'stopped', 'running');
      
      expect(message.messageType).toBe('STATE_CHANGE');
      expect(message.equipmentId).toBe('oven1');
      expect(message.tags).toHaveLength(2);
      
      const previousStateTag = message.tags.find(t => t.tagId === 'previous_state');
      const currentStateTag = message.tags.find(t => t.tagId === 'current_state');
      
      expect(previousStateTag?.value).toBe('stopped');
      expect(currentStateTag?.value).toBe('running');
    });
  });

  describe('createHeartbeatMessage', () => {
    it('should create a heartbeat message', () => {
      const message = formatter.createHeartbeatMessage('oven1', 'Factory-A', 'Electronics', 1);
      
      expect(message.messageType).toBe('HEARTBEAT');
      expect(message.equipmentId).toBe('oven1');
      expect(message.tags).toHaveLength(1);
      expect(message.tags[0].tagId).toBe('heartbeat');
      expect(message.tags[0].value).toBe(true);
    });
  });

  describe('createAlarmMessage', () => {
    it('should create an alarm message', () => {
      const message = formatter.createAlarmMessage('oven1', 'Factory-A', 'Electronics', 1, 'TEMPERATURE_HIGH', 'Temperature exceeded maximum threshold');
      
      expect(message.messageType).toBe('ALARM');
      expect(message.equipmentId).toBe('oven1');
      expect(message.tags).toHaveLength(2);
      
      const alarmTypeTag = message.tags.find(t => t.tagId === 'alarm_type');
      const alarmMessageTag = message.tags.find(t => t.tagId === 'alarm_message');
      
      expect(alarmTypeTag?.value).toBe('TEMPERATURE_HIGH');
      expect(alarmMessageTag?.value).toBe('Temperature exceeded maximum threshold');
    });
  });

  describe('validateMessage', () => {
    const validMessage: PLCMessage = {
      id: 'test-message-1',
      timestamp: new Date(),
      equipmentId: 'oven1',
      site: 'Factory-A',
      productType: 'Electronics',
      lineNumber: 1,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'temperature',
          value: 350,
          quality: 'GOOD'
        }
      ]
    };

    it('should validate a correct message', () => {
      const result = formatter.validateMessage(validMessage);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject message without ID', () => {
      const invalidMessage = { ...validMessage, id: '' };
      const result = formatter.validateMessage(invalidMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message ID is required');
    });

    it('should reject message without timestamp', () => {
      const invalidMessage = { ...validMessage, timestamp: {} as unknown as Date };
      const result = formatter.validateMessage(invalidMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Timestamp is required');
    });

    it('should reject message with invalid message type', () => {
      const invalidMessage = { ...validMessage, messageType: {} as unknown as PLCMessage['messageType'] };
      const result = formatter.validateMessage(invalidMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid message type');
    });

    it('should reject duplicate message IDs', () => {
      formatter.validateMessage(validMessage);
      const result = formatter.validateMessage(validMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate message ID detected');
    });

    it('should reject message with invalid tag quality', () => {
      const invalidMessage = {
        ...validMessage,
        tags: [
          {
            tagId: 'temperature',
            value: 350,
            quality: 'INVALID_QUALITY' as unknown
          }
        ]
      };
      const result = formatter.validateMessage(invalidMessage);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tag 0: invalid quality value');
    });
  });

  describe('serialization and deserialization', () => {
    const testMessage: PLCMessage = {
      id: 'test-message-1',
      timestamp: new Date(),
      equipmentId: 'oven1',
      site: 'Factory-A',
      productType: 'Electronics',
      lineNumber: 1,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'temperature',
          value: 350,
          quality: 'GOOD'
        }
      ]
    };

    it('should serialize message to JSON string', () => {
      const serialized = formatter.serializeMessage(testMessage);
      
      expect(typeof serialized).toBe('string');
      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('should deserialize JSON string to message', () => {
      const serialized = formatter.serializeMessage(testMessage);
      const deserialized = formatter.deserializeMessage(serialized);
      
      expect(deserialized.id).toBe(testMessage.id);
      expect(deserialized.equipmentId).toBe(testMessage.equipmentId);
      expect(deserialized.messageType).toBe(testMessage.messageType);
      expect(deserialized.timestamp).toBeInstanceOf(Date);
      expect(deserialized.tags).toEqual(testMessage.tags);
    });

    it('should handle serialization errors', () => {
      const circularMessage = { ...testMessage } as unknown;
      circularMessage.circular = circularMessage;
      
      expect(() => formatter.serializeMessage(circularMessage)).toThrow('Message serialization failed');
    });

    it('should handle deserialization errors', () => {
      expect(() => formatter.deserializeMessage('invalid json')).toThrow('Message deserialization failed');
    });
  });
});