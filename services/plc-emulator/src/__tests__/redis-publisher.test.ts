import { RedisPublisher, RedisPublisherConfig } from '../messaging/redis-publisher';
import { PLCMessage } from '@factory-dashboard/shared-types';

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
    lPush: jest.fn(),
  }))
}));

describe('RedisPublisher', () => {
  let publisher: RedisPublisher;
  let mockRedisClient: {
    on: jest.MockedFunction<(event: string, listener: (...args: unknown[]) => void) => void>;
    connect: jest.MockedFunction<() => Promise<void>>;
    quit: jest.MockedFunction<() => Promise<void>>;
    lPush: jest.MockedFunction<(key: string, ...values: string[]) => Promise<number>>;
  };
  const config: RedisPublisherConfig = {
    host: 'localhost',
    port: 6379,
    maxRetries: 3,
    retryDelay: 1000,
    connectionPoolSize: 10
  };

  beforeEach(async () => {
    const redisModule = await import('redis');
    const { createClient } = redisModule;
    mockRedisClient = createClient() as unknown as {
      on: jest.MockedFunction<(event: string, listener: (...args: unknown[]) => void) => void>;
      connect: jest.MockedFunction<() => Promise<void>>;
      quit: jest.MockedFunction<() => Promise<void>>;
      lPush: jest.MockedFunction<(key: string, ...values: string[]) => Promise<number>>;
    };
    publisher = new RedisPublisher(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connection management', () => {
    it('should connect to Redis successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      
      await publisher.connect();
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(error);
      
      await expect(publisher.connect()).rejects.toThrow('Connection failed');
    });

    it('should disconnect from Redis', async () => {
      mockRedisClient.quit.mockResolvedValue(undefined);
      
      await publisher.disconnect();
      
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });

  describe('message publishing', () => {
    const testMessage: PLCMessage = {
      id: 'test-message-1',
      timestamp: new Date(),
      equipmentId: 'test-equipment',
      site: 'test-site',
      productType: 'test-product',
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

    it('should publish a single message', async () => {
      mockRedisClient.lPush.mockResolvedValue(1);
      
      // Simulate connected state
      publisher['isConnected'] = true;
      
      await publisher.publishMessage('test-queue', testMessage);
      
      expect(mockRedisClient.lPush).toHaveBeenCalledWith('test-queue', JSON.stringify(testMessage));
    });

    it('should publish batch messages', async () => {
      const messages = [testMessage, { ...testMessage, id: 'test-message-2' }];
      mockRedisClient.lPush.mockResolvedValue(2);
      
      publisher['isConnected'] = true;
      
      await publisher.publishBatch('test-queue', messages);
      
      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        'test-queue',
        JSON.stringify(messages[0]),
        JSON.stringify(messages[1])
      );
    });

    it('should buffer messages when disconnected', async () => {
      publisher['isConnected'] = false;
      
      await publisher.publishMessage('test-queue', testMessage);
      
      expect(publisher.getBufferSize()).toBe(1);
      expect(mockRedisClient.lPush).not.toHaveBeenCalled();
    });

    it('should handle publishing errors', async () => {
      const error = new Error('Publish failed');
      mockRedisClient.lPush.mockRejectedValue(error);
      
      publisher['isConnected'] = true;
      
      await expect(publisher.publishMessage('test-queue', testMessage)).rejects.toThrow('Publish failed');
      expect(publisher.getBufferSize()).toBe(1);
    });
  });

  describe('message buffering', () => {
    it('should prevent buffer overflow', async () => {
      publisher['isConnected'] = false;
      
      // Fill buffer beyond limit
      const baseMessage: PLCMessage = {
        id: 'test-message-1',
        timestamp: new Date(),
        equipmentId: 'test-equipment',
        site: 'test-site',
        productType: 'test-product',
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
      for (let i = 0; i < 10001; i++) {
        await publisher.publishMessage('test-queue', {
          ...baseMessage,
          id: `test-message-${i}`
        });
      }
      
      expect(publisher.getBufferSize()).toBe(10000);
    });
  });
});