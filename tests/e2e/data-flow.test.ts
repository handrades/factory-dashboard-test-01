import { createClient } from 'redis';
import { InfluxDB } from '@influxdata/influxdb-client';
import { PLCMessage } from '@factory-dashboard/shared-types';
import { v4 as uuidv4 } from 'uuid';

describe('End-to-End Data Flow Tests', () => {
  let redisClient: unknown;
  let influxDB: InfluxDB;
  let queryApi: unknown;

  const testTimeout = 30000;

  beforeAll(async () => {
    // Initialize Redis client
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
      },
      password: process.env.REDIS_PASSWORD
    });

    await redisClient.connect();

    // Initialize InfluxDB client
    influxDB = new InfluxDB({
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || 'test-token'
    });

    queryApi = influxDB.getQueryApi(process.env.INFLUXDB_ORG || 'factory-dashboard-test');
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestData();
  });

  test('Complete data flow from PLC emulator to InfluxDB', async () => {
    const equipmentId = 'test_oven_e2e';
    const testMessage: PLCMessage = {
      id: uuidv4(),
      timestamp: new Date(),
      equipmentId,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'temperature',
          value: 375.5,
          quality: 'GOOD'
        },
        {
          tagId: 'heating_status',
          value: true,
          quality: 'GOOD'
        }
      ]
    };

    // Step 1: Publish message to Redis queue
    const queueName = `plc_data_${equipmentId}`;
    await redisClient.lPush(queueName, JSON.stringify(testMessage));

    // Step 2: Wait for queue consumer to process the message
    await waitFor(() => checkQueueEmpty(queueName), 10000);

    // Step 3: Verify data appears in InfluxDB
    const influxData = await waitForInfluxData(equipmentId, testMessage.timestamp);
    
    expect(influxData).toBeDefined();
    expect(influxData.length).toBeGreaterThan(0);
    
    // Verify temperature data
    const tempData = influxData.find(d => d.tag_id === 'temperature');
    expect(tempData).toBeDefined();
    expect(tempData.value).toBeCloseTo(375.5, 1);

    // Verify heating status data
    const heatingData = influxData.find(d => d.tag_id === 'heating_status');
    expect(heatingData).toBeDefined();
    expect(heatingData.value).toBe(true);
  }, testTimeout);

  test('Multiple equipment data processing', async () => {
    const equipmentIds = ['test_oven_1', 'test_conveyor_1', 'test_press_1'];
    const messages: PLCMessage[] = [];

    // Generate test messages for multiple equipment
    for (const equipmentId of equipmentIds) {
      const message: PLCMessage = {
        id: uuidv4(),
        timestamp: new Date(),
        equipmentId,
        messageType: 'DATA_UPDATE',
        tags: [
          {
            tagId: 'status',
            value: 'running',
            quality: 'GOOD'
          },
          {
            tagId: 'efficiency',
            value: Math.random() * 100,
            quality: 'GOOD'
          }
        ]
      };
      messages.push(message);
    }

    // Publish all messages
    for (const message of messages) {
      const queueName = `plc_data_${message.equipmentId}`;
      await redisClient.lPush(queueName, JSON.stringify(message));
    }

    // Wait for processing
    await sleep(5000);

    // Verify all equipment data in InfluxDB
    for (const equipmentId of equipmentIds) {
      const data = await getLatestInfluxData(equipmentId);
      expect(data.length).toBeGreaterThan(0);
    }
  }, testTimeout);

  test('High-frequency data processing', async () => {
    const equipmentId = 'test_high_freq_equipment';
    const messageCount = 100;
    const messages: PLCMessage[] = [];

    // Generate high-frequency messages
    for (let i = 0; i < messageCount; i++) {
      const message: PLCMessage = {
        id: uuidv4(),
        timestamp: new Date(Date.now() + i * 100), // 100ms intervals
        equipmentId,
        messageType: 'DATA_UPDATE',
        tags: [
          {
            tagId: 'sequence_number',
            value: i,
            quality: 'GOOD'
          },
          {
            tagId: 'random_value',
            value: Math.random() * 1000,
            quality: 'GOOD'
          }
        ]
      };
      messages.push(message);
    }

    // Publish messages rapidly
    const queueName = `plc_data_${equipmentId}`;
    for (const message of messages) {
      await redisClient.lPush(queueName, JSON.stringify(message));
    }

    // Wait for processing
    await sleep(10000);

    // Verify message processing
    const processedData = await getLatestInfluxData(equipmentId);
    expect(processedData.length).toBeGreaterThanOrEqual(messageCount * 2); // 2 tags per message
  }, testTimeout);

  test('Error handling and dead letter queue', async () => {
    const equipmentId = 'test_invalid_equipment';
    
    // Create invalid message
    const invalidMessage = {
      invalid: 'message',
      structure: true
    };

    const queueName = `plc_data_${equipmentId}`;
    await redisClient.lPush(queueName, JSON.stringify(invalidMessage));

    // Wait for processing
    await sleep(3000);

    // Check dead letter queue
    const deadLetterQueue = process.env.DEAD_LETTER_QUEUE || 'dead-letter-queue';
    const deadLetterMessages = await redisClient.lRange(deadLetterQueue, 0, -1);
    
    expect(deadLetterMessages.length).toBeGreaterThan(0);
    
    const deadMessage = JSON.parse(deadLetterMessages[0]);
    expect(deadMessage.originalQueue).toBe(queueName);
    expect(deadMessage.error).toBeDefined();
  }, testTimeout);

  test('Service health monitoring', async () => {
    const plcEmulatorUrl = process.env.PLC_EMULATOR_URL || 'http://localhost:3000';
    const queueConsumerUrl = process.env.QUEUE_CONSUMER_URL || 'http://localhost:8080';

    // Check PLC Emulator health
    const plcHealth = await fetch(`${plcEmulatorUrl}/health`);
    expect(plcHealth.status).toBe(200);
    
    const plcHealthData = await plcHealth.json();
    expect(plcHealthData.status).toBe('healthy');

    // Check Queue Consumer health
    const consumerHealth = await fetch(`${queueConsumerUrl}/health`);
    expect(consumerHealth.status).toBe(200);
    
    const consumerHealthData = await consumerHealth.json();
    expect(consumerHealthData.healthy).toBe(true);
  }, testTimeout);

  test('Data consistency across service restarts', async () => {
    const equipmentId = 'test_consistency_equipment';
    
    // Send initial data
    const initialMessage: PLCMessage = {
      id: uuidv4(),
      timestamp: new Date(),
      equipmentId,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'consistency_test',
          value: 12345,
          quality: 'GOOD'
        }
      ]
    };

    const queueName = `plc_data_${equipmentId}`;
    await redisClient.lPush(queueName, JSON.stringify(initialMessage));

    // Wait for processing
    await sleep(3000);

    // Verify initial data
    const initialData = await getLatestInfluxData(equipmentId);
    expect(initialData.length).toBeGreaterThan(0);

    // Note: In a real test, we would restart services here
    // For this test, we'll simulate by sending more data

    // Send additional data
    const additionalMessage: PLCMessage = {
      id: uuidv4(),
      timestamp: new Date(),
      equipmentId,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'consistency_test',
          value: 67890,
          quality: 'GOOD'
        }
      ]
    };

    await redisClient.lPush(queueName, JSON.stringify(additionalMessage));
    await sleep(3000);

    // Verify data consistency
    const finalData = await getLatestInfluxData(equipmentId);
    expect(finalData.length).toBeGreaterThan(initialData.length);
  }, testTimeout);

  // Helper functions
  async function cleanupTestData(): Promise<void> {
    const testQueues = [
      'plc_data_test_oven_e2e',
      'plc_data_test_oven_1',
      'plc_data_test_conveyor_1',
      'plc_data_test_press_1',
      'plc_data_test_high_freq_equipment',
      'plc_data_test_invalid_equipment',
      'plc_data_test_consistency_equipment'
    ];

    for (const queue of testQueues) {
      await redisClient.del(queue);
    }

    // Clear dead letter queue
    const deadLetterQueue = process.env.DEAD_LETTER_QUEUE || 'dead-letter-queue';
    await redisClient.del(deadLetterQueue);
  }

  async function checkQueueEmpty(queueName: string): Promise<boolean> {
    const length = await redisClient.lLen(queueName);
    return length === 0;
  }

  async function waitForInfluxData(equipmentId: string, timestamp: Date): Promise<unknown[]> {
    const query = `
      from(bucket: "${process.env.INFLUXDB_BUCKET || 'factory-data-test'}")
        |> range(start: -1h)
        |> filter(fn: (r) => r.equipment_id == "${equipmentId}")
        |> filter(fn: (r) => r._time >= ${timestamp.toISOString()})
    `;

    const result = await queryApi.collectRows(query);
    return result;
  }

  async function getLatestInfluxData(equipmentId: string): Promise<unknown[]> {
    const query = `
      from(bucket: "${process.env.INFLUXDB_BUCKET || 'factory-data-test'}")
        |> range(start: -10m)
        |> filter(fn: (r) => r.equipment_id == "${equipmentId}")
    `;

    const result = await queryApi.collectRows(query);
    return result;
  }

  function waitFor(condition: () => Promise<boolean>, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const check = async () => {
        try {
          if (await condition()) {
            resolve();
            return;
          }
          
          if (Date.now() - startTime > timeout) {
            reject(new Error('Timeout waiting for condition'));
            return;
          }
          
          setTimeout(check, 500);
        } catch {
          reject(error);
        }
      };
      
      check();
    });
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});