import { createClient } from 'redis';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { PLCMessage } from '@factory-dashboard/shared-types';
import { v4 as uuidv4 } from 'uuid';

interface TestDataConfig {
  equipmentCount: number;
  messageRate: number; // messages per second
  duration: number; // seconds
  dataVariation: number; // percentage
}

export class TestDataGenerator {
  private redisClient: unknown;
  private influxDB: InfluxDB;
  private writeApi: unknown;
  private config: TestDataConfig;

  constructor(config: TestDataConfig) {
    this.config = config;
    
    // Initialize Redis client
    this.redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
      },
      password: process.env.REDIS_PASSWORD
    });

    // Initialize InfluxDB client
    this.influxDB = new InfluxDB({
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || 'test-token'
    });

    this.writeApi = this.influxDB.getWriteApi(
      process.env.INFLUXDB_ORG || 'factory-dashboard-test',
      process.env.INFLUXDB_BUCKET || 'factory-data-test'
    );
  }

  async connect(): Promise<void> {
    await this.redisClient.connect();
    console.log('Connected to Redis and InfluxDB');
  }

  async disconnect(): Promise<void> {
    await this.redisClient.quit();
    await this.writeApi.close();
    console.log('Disconnected from Redis and InfluxDB');
  }

  async generateTestData(): Promise<void> {
    console.log(`Generating test data for ${this.config.duration} seconds...`);
    
    const interval = 1000 / this.config.messageRate;
    const totalMessages = this.config.duration * this.config.messageRate;
    let messageCount = 0;

    const timer = setInterval(async () => {
      if (messageCount >= totalMessages) {
        clearInterval(timer);
        console.log(`Generated ${messageCount} test messages`);
        return;
      }

      // Generate messages for all equipment
      for (let i = 0; i < this.config.equipmentCount; i++) {
        const equipmentId = `test_equipment_${i}`;
        const message = this.generatePLCMessage(equipmentId);
        
        // Send to Redis
        await this.publishToRedis(message);
        
        // Write to InfluxDB
        await this.writeToInfluxDB(message);
        
        messageCount++;
      }
    }, interval);
  }

  private generatePLCMessage(equipmentId: string): PLCMessage {
    const equipmentType = this.getEquipmentType(equipmentId);
    const tags = this.generateTagsForEquipment(equipmentId, equipmentType);

    return {
      id: uuidv4(),
      timestamp: new Date(),
      equipmentId,
      messageType: 'DATA_UPDATE',
      tags
    };
  }

  private getEquipmentType(equipmentId: string): string {
    const types = ['oven', 'conveyor', 'press', 'assembly'];
    const index = parseInt(equipmentId.split('_')[2]) % types.length;
    return types[index];
  }

  private generateTagsForEquipment(equipmentId: string, equipmentType: string): unknown[] {
    // const _baseValue = 100;
    const variation = this.config.dataVariation / 100;
    
    const generateValue = (base: number) => {
      const randomFactor = (Math.random() - 0.5) * 2 * variation;
      return base * (1 + randomFactor);
    };

    switch (equipmentType) {
      case 'oven':
        return [
          {
            tagId: 'temperature',
            value: generateValue(350),
            quality: Math.random() > 0.95 ? 'BAD' : 'GOOD'
          },
          {
            tagId: 'heating_status',
            value: Math.random() > 0.1,
            quality: 'GOOD'
          },
          {
            tagId: 'door_status',
            value: Math.random() > 0.8,
            quality: 'GOOD'
          }
        ];
      
      case 'conveyor':
        return [
          {
            tagId: 'speed',
            value: generateValue(2.5),
            quality: Math.random() > 0.95 ? 'BAD' : 'GOOD'
          },
          {
            tagId: 'motor_status',
            value: Math.random() > 0.05,
            quality: 'GOOD'
          },
          {
            tagId: 'belt_tension',
            value: generateValue(75),
            quality: 'GOOD'
          }
        ];
      
      case 'press':
        return [
          {
            tagId: 'pressure',
            value: generateValue(150),
            quality: Math.random() > 0.95 ? 'BAD' : 'GOOD'
          },
          {
            tagId: 'position',
            value: generateValue(50),
            quality: 'GOOD'
          },
          {
            tagId: 'cycle_count',
            value: Math.floor(Math.random() * 1000),
            quality: 'GOOD'
          }
        ];
      
      case 'assembly':
        return [
          {
            tagId: 'station1_active',
            value: Math.random() > 0.3,
            quality: 'GOOD'
          },
          {
            tagId: 'station2_active',
            value: Math.random() > 0.3,
            quality: 'GOOD'
          },
          {
            tagId: 'cycle_time',
            value: generateValue(28),
            quality: 'GOOD'
          }
        ];
      
      default:
        return [];
    }
  }

  private async publishToRedis(message: PLCMessage): Promise<void> {
    const queueName = `plc_data_${message.equipmentId}`;
    await this.redisClient.lPush(queueName, JSON.stringify(message));
  }

  private async writeToInfluxDB(message: PLCMessage): Promise<void> {
    for (const tag of message.tags) {
      const point = new Point('test_data')
        .tag('equipment_id', message.equipmentId)
        .tag('tag_id', tag.tagId)
        .tag('quality', tag.quality)
        .timestamp(message.timestamp);

      if (typeof tag.value === 'number') {
        point.floatField('value', tag.value);
      } else if (typeof tag.value === 'boolean') {
        point.booleanField('value', tag.value);
      } else {
        point.stringField('value', String(tag.value));
      }

      this.writeApi.writePoint(point);
    }
  }

  async cleanupTestData(): Promise<void> {
    console.log('Cleaning up test data...');
    
    // Clear Redis queues
    for (let i = 0; i < this.config.equipmentCount; i++) {
      const queueName = `plc_data_test_equipment_${i}`;
      await this.redisClient.del(queueName);
    }

    // Clear all test-related keys
    const testKeys = await this.redisClient.keys('*test*');
    if (testKeys.length > 0) {
      await this.redisClient.del(testKeys);
    }

    // Clear InfluxDB test data
    const deleteApi = this.influxDB.getDeleteApi();
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
    const stop = new Date().toISOString();
    
    await deleteApi.deleteData({
      org: process.env.INFLUXDB_ORG || 'factory-dashboard-test',
      bucket: process.env.INFLUXDB_BUCKET || 'factory-data-test',
      start,
      stop,
      predicate: '_measurement="test_data"'
    });

    console.log('Test data cleanup completed');
  }

  async generatePerformanceTestData(messagesPerSecond: number, durationSeconds: number): Promise<void> {
    console.log(`Generating performance test data: ${messagesPerSecond} msg/s for ${durationSeconds}s`);
    
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    let messageCount = 0;

    while (Date.now() < endTime) {
      const batchStartTime = Date.now();
      const batchSize = Math.max(1, Math.floor(messagesPerSecond / 10)); // 10 batches per second
      
      // Generate batch of messages
      const promises = [];
      for (let i = 0; i < batchSize; i++) {
        const equipmentId = `perf_test_equipment_${i % this.config.equipmentCount}`;
        const message = this.generatePLCMessage(equipmentId);
        promises.push(this.publishToRedis(message));
        messageCount++;
      }

      await Promise.all(promises);

      // Wait to maintain rate
      const batchDuration = Date.now() - batchStartTime;
      const targetBatchDuration = 100; // 100ms per batch (10 batches/sec)
      if (batchDuration < targetBatchDuration) {
        await this.sleep(targetBatchDuration - batchDuration);
      }
    }

    console.log(`Generated ${messageCount} performance test messages`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generateAnomalyData(): Promise<void> {
    console.log('Generating anomaly test data...');
    
    // Generate equipment with faults
    for (let i = 0; i < 5; i++) {
      const equipmentId = `fault_equipment_${i}`;
      const message: PLCMessage = {
        id: uuidv4(),
        timestamp: new Date(),
        equipmentId,
        messageType: 'ALARM',
        tags: [
          {
            tagId: 'fault_status',
            value: true,
            quality: 'BAD'
          },
          {
            tagId: 'error_code',
            value: `ERR_${1000 + i}`,
            quality: 'GOOD'
          }
        ]
      };

      await this.publishToRedis(message);
    }

    // Generate high-frequency data bursts
    for (let i = 0; i < 100; i++) {
      const equipmentId = `burst_equipment_${i % 3}`;
      const message = this.generatePLCMessage(equipmentId);
      await this.publishToRedis(message);
    }

    console.log('Anomaly test data generated');
  }
}

// CLI interface
if (require.main === module) {
  const config: TestDataConfig = {
    equipmentCount: parseInt(process.env.EQUIPMENT_COUNT || '10', 10),
    messageRate: parseFloat(process.env.MESSAGE_RATE || '10'),
    duration: parseInt(process.env.DURATION || '60', 10),
    dataVariation: parseFloat(process.env.DATA_VARIATION || '10')
  };

  const generator = new TestDataGenerator(config);

  const command = process.argv[2];

  async function run() {
    await generator.connect();

    try {
      switch (command) {
        case 'generate':
          await generator.generateTestData();
          break;
        case 'cleanup':
          await generator.cleanupTestData();
          break;
        case 'performance': {
          const msgPerSec = parseInt(process.argv[3] || '100', 10);
          const duration = parseInt(process.argv[4] || '60', 10);
          await generator.generatePerformanceTestData(msgPerSec, duration);
          break;
        }
        case 'anomaly':
          await generator.generateAnomalyData();
          break;
        default:
          console.log('Usage: node test-data-generator.js [generate|cleanup|performance|anomaly]');
          process.exit(1);
      }
    } finally {
      await generator.disconnect();
    }
  }

  run().catch(console.error);
}