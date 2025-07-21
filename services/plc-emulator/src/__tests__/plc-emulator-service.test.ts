import { PLCEmulatorService, PLCEmulatorServiceConfig } from '../service/plc-emulator-service';
import { EquipmentConfig } from '@factory-dashboard/shared-types';
import { resolve } from 'path';

// Mock external dependencies
jest.mock('../config/config-loader');
jest.mock('../messaging/redis-publisher');
jest.mock('winston');

describe('PLCEmulatorService', () => {
  let service: PLCEmulatorService;
  let mockConfigLoader: unknown;
  let mockRedisPublisher: unknown;
  
  const testConfig: PLCEmulatorServiceConfig = {
    configDirectory: resolve(__dirname, '../config'),
    updateInterval: 100,
    heartbeatInterval: 1000,
    gracefulShutdownTimeout: 5000,
    enableHealthChecks: true,
    redis: {
      host: 'localhost',
      port: 6379,
      maxRetries: 3,
      retryDelay: 100,
      connectionPoolSize: 5
    }
  };

  const testEquipmentConfig: EquipmentConfig = {
    id: 'test_oven',
    name: 'Test Oven',
    type: 'oven',
    lineId: 'test_line',
    site: 'Factory-A',
    productType: 'Electronics',
    lineNumber: 1,
    currentState: 'running',
    states: [
      {
        name: 'running',
        description: 'Running state',
        tagOverrides: [],
        transitions: []
      }
    ],
    tags: [
      {
        id: 'temperature',
        name: 'Temperature',
        equipmentId: 'test_oven',
        dataType: 'REAL',
        address: 'DB1.DBD0',
        value: 350,
        timestamp: new Date(),
        quality: 'GOOD'
      }
    ]
  };

  beforeEach(async () => {
    const configModule = await import('../config/config-loader');
    const redisModule = await import('../messaging/redis-publisher');
    const { ConfigLoader } = configModule;
    const { RedisPublisher } = redisModule;
    
    mockConfigLoader = {
      loadConfiguration: jest.fn().mockResolvedValue([testEquipmentConfig]),
      stopWatching: jest.fn(),
      on: jest.fn()
    };
    
    mockRedisPublisher = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      publishMessage: jest.fn().mockResolvedValue(undefined),
      isConnectedToRedis: jest.fn().mockReturnValue(true),
      getBufferSize: jest.fn().mockReturnValue(0),
      on: jest.fn()
    };
    
    (ConfigLoader as jest.MockedClass<typeof ConfigLoader>).mockImplementation(() => mockConfigLoader as any);
    (RedisPublisher as jest.MockedClass<typeof RedisPublisher>).mockImplementation(() => mockRedisPublisher as any);
    
    service = new PLCEmulatorService(testConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (service && service.isServiceRunning()) {
      service.stop();
    }
  });

  describe('service lifecycle', () => {
    it('should start successfully', async () => {
      const startPromise = service.start();
      
      // Wait for service to start
      await expect(startPromise).resolves.not.toThrow();
      
      expect((mockConfigLoader as any).loadConfiguration).toHaveBeenCalled();
      expect((mockRedisPublisher as any).connect).toHaveBeenCalled();
      expect(service.isServiceRunning()).toBe(true);
    });

    it('should stop successfully', async () => {
      await service.start();
      
      const stopPromise = service.stop();
      
      await expect(stopPromise).resolves.not.toThrow();
      
      expect((mockConfigLoader as any).stopWatching).toHaveBeenCalled();
      expect((mockRedisPublisher as any).disconnect).toHaveBeenCalled();
      expect(service.isServiceRunning()).toBe(false);
    });

    it('should handle start errors', async () => {
      (mockConfigLoader as any).loadConfiguration.mockRejectedValue(new Error('Config load failed'));
      
      await expect(service.start()).rejects.toThrow('Config load failed');
    });
  });

  describe('equipment simulation', () => {
    beforeEach(async () => {
      await service.start();
    });

    afterEach(async () => {
      await service.stop();
    });

    it('should track equipment status', () => {
      const status = service.getEquipmentStatus();
      
      expect(status).toHaveProperty('test_oven', 'running');
    });

    it('should force equipment state transitions', () => {
      const result = service.forceEquipmentStateTransition('test_oven', 'stopped');
      
      expect(result).toBe(true);
    });

    it('should handle invalid equipment state transitions', () => {
      const result = service.forceEquipmentStateTransition('nonexistent', 'stopped');
      
      expect(result).toBe(false);
    });
  });

  describe('service statistics', () => {
    beforeEach(async () => {
      await service.start();
    });

    afterEach(async () => {
      await service.stop();
    });

    it('should provide service statistics', () => {
      const stats = service.getServiceStats();
      
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('messagesPublished');
      expect(stats).toHaveProperty('equipmentCount', 1);
      expect(stats).toHaveProperty('lastUpdateTime');
      expect(stats).toHaveProperty('isConnectedToRedis');
      expect(stats).toHaveProperty('bufferSize');
    });

    it('should track message publishing statistics', () => {
      const initialStats = service.getServiceStats();
      
      expect(initialStats.messagesPublished).toBeGreaterThanOrEqual(0);
      expect(initialStats.equipmentCount).toBe(1);
    });
  });

  describe('event handling', () => {
    it('should emit started event on successful start', async () => {
      const startedHandler = jest.fn();
      service.on('started', startedHandler);
      
      await service.start();
      
      expect(startedHandler).toHaveBeenCalled();
    });

    it('should emit stopped event on successful stop', async () => {
      const stoppedHandler = jest.fn();
      service.on('stopped', stoppedHandler);
      
      await service.start();
      await service.stop();
      
      expect(stoppedHandler).toHaveBeenCalled();
    });

    it('should emit startError event on start failure', async () => {
      const errorHandler = jest.fn();
      service.on('startError', errorHandler);
      
      (mockConfigLoader as any).loadConfiguration.mockRejectedValue(new Error('Test error'));
      
      await expect(service.start()).rejects.toThrow();
      expect(errorHandler).toHaveBeenCalled();
    });
  });
});