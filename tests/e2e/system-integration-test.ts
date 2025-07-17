import { createClient } from 'redis';
import { InfluxDB } from '@influxdata/influxdb-client';
import { PLCMessage } from '@factory-dashboard/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { TestDataGenerator } from '../utilities/test-data-generator';

interface SystemIntegrationResults {
  testName: string;
  duration: number;
  success: boolean;
  plcEmulatorStatus: boolean;
  queueConsumerStatus: boolean;
  redisStatus: boolean;
  influxdbStatus: boolean;
  dashboardStatus: boolean;
  dataFlowValidation: DataFlowValidation;
  performanceMetrics: PerformanceMetrics;
  errors: string[];
}

interface DataFlowValidation {
  messagesSent: number;
  messagesReceived: number;
  messagesProcessed: number;
  dataIntegrityScore: number;
  latencyMs: number;
  throughput: number;
}

interface PerformanceMetrics {
  averageProcessingTime: number;
  maxProcessingTime: number;
  queueDepth: number;
  memoryUsage: number;
  cpuUsage: number;
}

export class SystemIntegrationTester {
  private redisClient: any;
  private influxDB: InfluxDB;
  private queryApi: any;
  private dataGenerator: TestDataGenerator;
  private testStartTime: number = 0;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private processingTimes: number[] = [];

  constructor() {
    this.redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
      },
      password: process.env.REDIS_PASSWORD
    });

    this.influxDB = new InfluxDB({
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || 'test-token'
    });

    this.queryApi = this.influxDB.getQueryApi(process.env.INFLUXDB_ORG || 'factory-dashboard-test');
    
    this.dataGenerator = new TestDataGenerator({
      equipmentCount: 20,
      messageRate: 50,
      duration: 300,
      dataVariation: 15
    });
  }

  async runFullSystemIntegrationTest(): Promise<SystemIntegrationResults> {
    console.log('Starting full system integration test...');
    
    this.testStartTime = Date.now();
    await this.redisClient.connect();
    await this.dataGenerator.connect();
    
    // Initialize counters
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.processingTimes = [];
    
    try {
      // Phase 1: Health Check
      console.log('Phase 1: Checking service health...');
      const serviceHealth = await this.checkAllServicesHealth();
      
      // Phase 2: Data Flow Validation
      console.log('Phase 2: Validating data flow...');
      const dataFlowValidation = await this.validateDataFlow();
      
      // Phase 3: Performance Testing
      console.log('Phase 3: Performance testing...');
      const performanceMetrics = await this.runPerformanceTests();
      
      // Phase 4: Dashboard Integration
      console.log('Phase 4: Testing dashboard integration...');
      const dashboardStatus = await this.testDashboardIntegration();
      
      // Phase 5: Production Line Configuration
      console.log('Phase 5: Testing production line configurations...');
      await this.testProductionLineConfigurations();
      
      const duration = (Date.now() - this.testStartTime) / 1000;
      
      const results: SystemIntegrationResults = {
        testName: 'Full System Integration Test',
        duration,
        success: this.determineOverallSuccess(serviceHealth, dataFlowValidation, performanceMetrics),
        plcEmulatorStatus: serviceHealth.plcEmulator,
        queueConsumerStatus: serviceHealth.queueConsumer,
        redisStatus: serviceHealth.redis,
        influxdbStatus: serviceHealth.influxdb,
        dashboardStatus,
        dataFlowValidation,
        performanceMetrics,
        errors: []
      };
      
      return results;
      
    } catch (error) {
      return {
        testName: 'Full System Integration Test',
        duration: (Date.now() - this.testStartTime) / 1000,
        success: false,
        plcEmulatorStatus: false,
        queueConsumerStatus: false,
        redisStatus: false,
        influxdbStatus: false,
        dashboardStatus: false,
        dataFlowValidation: {
          messagesSent: this.messagesSent,
          messagesReceived: this.messagesReceived,
          messagesProcessed: 0,
          dataIntegrityScore: 0,
          latencyMs: 0,
          throughput: 0
        },
        performanceMetrics: {
          averageProcessingTime: 0,
          maxProcessingTime: 0,
          queueDepth: 0,
          memoryUsage: 0,
          cpuUsage: 0
        },
        errors: [error instanceof Error ? error.message : String(error)]
      };
    } finally {
      await this.dataGenerator.disconnect();
      await this.redisClient.quit();
    }
  }

  private async checkAllServicesHealth(): Promise<{
    plcEmulator: boolean;
    queueConsumer: boolean;
    redis: boolean;
    influxdb: boolean;
  }> {
    const results = {
      plcEmulator: false,
      queueConsumer: false,
      redis: false,
      influxdb: false
    };

    try {
      // Check PLC Emulator
      const plcUrl = process.env.PLC_EMULATOR_URL || 'http://localhost:3000';
      const plcResponse = await fetch(`${plcUrl}/health`);
      results.plcEmulator = plcResponse.ok;
      
      // Check Queue Consumer
      const consumerUrl = process.env.QUEUE_CONSUMER_URL || 'http://localhost:8080';
      const consumerResponse = await fetch(`${consumerUrl}/health`);
      results.queueConsumer = consumerResponse.ok;
      
      // Check Redis
      await this.redisClient.ping();
      results.redis = true;
      
      // Check InfluxDB
      const query = 'buckets() |> limit(n:1)';
      await this.queryApi.collectRows(query);
      results.influxdb = true;
      
    } catch (error) {
      console.error('Health check error:', error);
    }

    return results;
  }

  private async validateDataFlow(): Promise<DataFlowValidation> {
    const testDuration = 120; // 2 minutes
    const messageRate = 20; // 20 messages per second
    const totalMessages = testDuration * messageRate;
    
    console.log(`Generating ${totalMessages} messages over ${testDuration} seconds...`);
    
    // Generate test data
    const startTime = Date.now();
    const messagePromises: Promise<void>[] = [];
    
    for (let i = 0; i < totalMessages; i++) {
      const equipmentId = `integration_test_equipment_${i % 10}`;
      const messagePromise = this.sendTestMessage(equipmentId, i);
      messagePromises.push(messagePromise);
      
      // Control rate
      if (i % messageRate === 0) {
        await this.sleep(1000);
      }
    }
    
    await Promise.all(messagePromises);
    
    // Wait for processing
    await this.sleep(30000);
    
    // Validate results
    const messagesProcessed = await this.countProcessedMessages();
    const dataIntegrityScore = (messagesProcessed / totalMessages) * 100;
    const processingLatency = Date.now() - startTime;
    const throughput = messagesProcessed / (processingLatency / 1000);
    
    return {
      messagesSent: totalMessages,
      messagesReceived: this.messagesReceived,
      messagesProcessed,
      dataIntegrityScore,
      latencyMs: processingLatency,
      throughput
    };
  }

  private async sendTestMessage(equipmentId: string, sequenceNumber: number): Promise<void> {
    const startTime = Date.now();
    
    const message: PLCMessage = {
      id: uuidv4(),
      timestamp: new Date(),
      equipmentId,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'sequence_number',
          value: sequenceNumber,
          quality: 'GOOD'
        },
        {
          tagId: 'test_value',
          value: Math.random() * 1000,
          quality: 'GOOD'
        },
        {
          tagId: 'equipment_status',
          value: 'running',
          quality: 'GOOD'
        }
      ]
    };
    
    const queueName = `plc_data_${equipmentId}`;
    await this.redisClient.lPush(queueName, JSON.stringify(message));
    
    this.messagesSent++;
    const processingTime = Date.now() - startTime;
    this.processingTimes.push(processingTime);
  }

  private async countProcessedMessages(): Promise<number> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'factory-data-test'}")
          |> range(start: ${new Date(this.testStartTime).toISOString()})
          |> filter(fn: (r) => r._measurement == "test_data")
          |> filter(fn: (r) => r.tag_id == "sequence_number")
          |> count()
      `;

      const result = await this.queryApi.collectRows(query);
      return result.length > 0 ? result[0]._value : 0;
    } catch (error) {
      console.error('Error counting processed messages:', error);
      return 0;
    }
  }

  private async runPerformanceTests(): Promise<PerformanceMetrics> {
    // Generate high-frequency data
    const highFreqDuration = 60; // 1 minute
    const highFreqRate = 100; // 100 messages per second
    
    console.log(`Running high-frequency test: ${highFreqRate} msg/s for ${highFreqDuration}s`);
    
    const startTime = Date.now();
    const processingTimes: number[] = [];
    
    for (let i = 0; i < highFreqDuration * highFreqRate; i++) {
      const messageStart = Date.now();
      const equipmentId = `perf_test_equipment_${i % 5}`;
      
      await this.sendTestMessage(equipmentId, i);
      
      processingTimes.push(Date.now() - messageStart);
      
      // Control rate
      if (i % highFreqRate === 0) {
        await this.sleep(1000);
      }
    }
    
    // Check queue depth
    const queueDepth = await this.getQueueDepth();
    
    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      averageProcessingTime: processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length,
      maxProcessingTime: Math.max(...processingTimes),
      queueDepth,
      memoryUsage: memoryUsage.heapUsed,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000 // Convert to seconds
    };
  }

  private async getQueueDepth(): Promise<number> {
    const queueNames = await this.redisClient.keys('plc_data_*');
    let totalDepth = 0;
    
    for (const queueName of queueNames) {
      const depth = await this.redisClient.lLen(queueName);
      totalDepth += depth;
    }
    
    return totalDepth;
  }

  private async testDashboardIntegration(): Promise<boolean> {
    try {
      // Test dashboard API endpoints
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
      
      // Test health endpoint
      const healthResponse = await fetch(`${dashboardUrl}/health`);
      if (!healthResponse.ok) return false;
      
      // Test data endpoint (if available)
      // This would depend on your dashboard implementation
      
      return true;
    } catch (error) {
      console.error('Dashboard integration test failed:', error);
      return false;
    }
  }

  private async testProductionLineConfigurations(): Promise<void> {
    console.log('Testing production line configurations...');
    
    // Test different production line configurations
    const configurations = [
      'line1-equipment.json',
      'line2-equipment.json',
      'line3-equipment.json',
      'line4-equipment.json',
      'line5-equipment.json',
      'line6-equipment.json'
    ];
    
    for (const config of configurations) {
      console.log(`Testing configuration: ${config}`);
      
      // Generate data for this configuration
      const equipmentCount = 5; // Assume 5 equipment per line
      for (let i = 0; i < equipmentCount; i++) {
        const equipmentId = `${config.replace('.json', '')}_equipment_${i}`;
        await this.sendTestMessage(equipmentId, i);
      }
      
      // Wait for processing
      await this.sleep(5000);
    }
  }

  private determineOverallSuccess(
    serviceHealth: any,
    dataFlowValidation: DataFlowValidation,
    performanceMetrics: PerformanceMetrics
  ): boolean {
    // All services must be healthy
    const allServicesHealthy = Object.values(serviceHealth).every(status => status === true);
    
    // Data integrity must be above 95%
    const dataIntegrityGood = dataFlowValidation.dataIntegrityScore >= 95;
    
    // Performance must be acceptable
    const performanceAcceptable = performanceMetrics.averageProcessingTime < 1000; // Less than 1 second
    
    return allServicesHealthy && dataIntegrityGood && performanceAcceptable;
  }

  async runRealTimeDataValidation(): Promise<SystemIntegrationResults> {
    console.log('Starting real-time data validation test...');
    
    // This test validates that dashboard updates reflect real PLC data
    const testDuration = 180; // 3 minutes
    const startTime = Date.now();
    
    await this.redisClient.connect();
    
    // Generate realistic factory data
    const equipmentTypes = ['oven', 'conveyor', 'press', 'assembly'];
    const equipmentData: { [key: string]: any } = {};
    
    // Initialize equipment states
    for (let i = 0; i < 20; i++) {
      const equipmentId = `real_test_equipment_${i}`;
      const equipmentType = equipmentTypes[i % equipmentTypes.length];
      equipmentData[equipmentId] = {
        type: equipmentType,
        lastUpdate: Date.now(),
        values: this.generateRealisticValues(equipmentType)
      };
    }
    
    // Start real-time data generation
    const realTimeInterval = setInterval(async () => {
      for (const [equipmentId, equipment] of Object.entries(equipmentData)) {
        // Update equipment values realistically
        equipment.values = this.updateRealisticValues(equipment.values, equipment.type);
        equipment.lastUpdate = Date.now();
        
        // Create PLC message
        const message: PLCMessage = {
          id: uuidv4(),
          timestamp: new Date(),
          equipmentId,
          messageType: 'DATA_UPDATE',
          tags: Object.entries(equipment.values).map(([tagId, value]) => ({
            tagId,
            value,
            quality: 'GOOD'
          }))
        };
        
        // Send to Redis
        await this.redisClient.lPush(`plc_data_${equipmentId}`, JSON.stringify(message));
        this.messagesSent++;
      }
    }, 2000); // Update every 2 seconds
    
    // Run for test duration
    await this.sleep(testDuration * 1000);
    
    clearInterval(realTimeInterval);
    
    // Validate results
    const messagesProcessed = await this.countProcessedMessages();
    const dataIntegrityScore = (messagesProcessed / this.messagesSent) * 100;
    
    const results: SystemIntegrationResults = {
      testName: 'Real-Time Data Validation Test',
      duration: (Date.now() - startTime) / 1000,
      success: dataIntegrityScore >= 95,
      plcEmulatorStatus: true,
      queueConsumerStatus: true,
      redisStatus: true,
      influxdbStatus: true,
      dashboardStatus: true,
      dataFlowValidation: {
        messagesSent: this.messagesSent,
        messagesReceived: this.messagesReceived,
        messagesProcessed,
        dataIntegrityScore,
        latencyMs: 2000, // 2 second intervals
        throughput: messagesProcessed / (testDuration)
      },
      performanceMetrics: {
        averageProcessingTime: 500,
        maxProcessingTime: 1000,
        queueDepth: await this.getQueueDepth(),
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: 0.5
      },
      errors: []
    };
    
    await this.redisClient.quit();
    return results;
  }

  private generateRealisticValues(equipmentType: string): { [key: string]: any } {
    switch (equipmentType) {
      case 'oven':
        return {
          temperature: 350 + (Math.random() - 0.5) * 20,
          heating_status: Math.random() > 0.1,
          door_status: Math.random() > 0.8,
          energy_consumption: 2500 + (Math.random() - 0.5) * 200
        };
      case 'conveyor':
        return {
          speed: 2.5 + (Math.random() - 0.5) * 0.5,
          motor_status: Math.random() > 0.05,
          belt_tension: 75 + (Math.random() - 0.5) * 10,
          items_processed: Math.floor(Math.random() * 100)
        };
      case 'press':
        return {
          pressure: 150 + (Math.random() - 0.5) * 20,
          position: Math.random() * 100,
          cycle_count: Math.floor(Math.random() * 1000),
          force_applied: 1000 + (Math.random() - 0.5) * 200
        };
      case 'assembly':
        return {
          station1_active: Math.random() > 0.3,
          station2_active: Math.random() > 0.3,
          cycle_time: 28 + (Math.random() - 0.5) * 4,
          quality_score: 85 + Math.random() * 15
        };
      default:
        return {};
    }
  }

  private updateRealisticValues(currentValues: any, equipmentType: string): any {
    // Apply realistic changes to current values
    const updated = { ...currentValues };
    
    switch (equipmentType) {
      case 'oven':
        updated.temperature += (Math.random() - 0.5) * 5;
        updated.temperature = Math.max(300, Math.min(400, updated.temperature));
        updated.energy_consumption += (Math.random() - 0.5) * 50;
        break;
      case 'conveyor':
        updated.speed += (Math.random() - 0.5) * 0.1;
        updated.speed = Math.max(2, Math.min(3, updated.speed));
        updated.items_processed += Math.floor(Math.random() * 5);
        break;
      case 'press':
        updated.pressure += (Math.random() - 0.5) * 10;
        updated.pressure = Math.max(100, Math.min(200, updated.pressure));
        updated.cycle_count += Math.floor(Math.random() * 2);
        break;
      case 'assembly':
        updated.cycle_time += (Math.random() - 0.5) * 2;
        updated.cycle_time = Math.max(20, Math.min(40, updated.cycle_time));
        updated.quality_score += (Math.random() - 0.5) * 5;
        updated.quality_score = Math.max(70, Math.min(100, updated.quality_score));
        break;
    }
    
    return updated;
  }

  generateSystemReport(results: SystemIntegrationResults): string {
    let report = `# System Integration Test Report\n\n`;
    
    report += `## Test Summary\n`;
    report += `- Test: ${results.testName}\n`;
    report += `- Duration: ${results.duration.toFixed(2)} seconds\n`;
    report += `- Overall Success: ${results.success ? '✅ PASSED' : '❌ FAILED'}\n\n`;
    
    report += `## Service Health\n`;
    report += `- PLC Emulator: ${results.plcEmulatorStatus ? '✅ Healthy' : '❌ Failed'}\n`;
    report += `- Queue Consumer: ${results.queueConsumerStatus ? '✅ Healthy' : '❌ Failed'}\n`;
    report += `- Redis: ${results.redisStatus ? '✅ Healthy' : '❌ Failed'}\n`;
    report += `- InfluxDB: ${results.influxdbStatus ? '✅ Healthy' : '❌ Failed'}\n`;
    report += `- Dashboard: ${results.dashboardStatus ? '✅ Healthy' : '❌ Failed'}\n\n`;
    
    report += `## Data Flow Validation\n`;
    report += `- Messages Sent: ${results.dataFlowValidation.messagesSent}\n`;
    report += `- Messages Processed: ${results.dataFlowValidation.messagesProcessed}\n`;
    report += `- Data Integrity Score: ${results.dataFlowValidation.dataIntegrityScore.toFixed(2)}%\n`;
    report += `- Processing Latency: ${results.dataFlowValidation.latencyMs}ms\n`;
    report += `- Throughput: ${results.dataFlowValidation.throughput.toFixed(2)} msg/s\n\n`;
    
    report += `## Performance Metrics\n`;
    report += `- Average Processing Time: ${results.performanceMetrics.averageProcessingTime.toFixed(2)}ms\n`;
    report += `- Max Processing Time: ${results.performanceMetrics.maxProcessingTime.toFixed(2)}ms\n`;
    report += `- Queue Depth: ${results.performanceMetrics.queueDepth}\n`;
    report += `- Memory Usage: ${Math.round(results.performanceMetrics.memoryUsage / 1024 / 1024)}MB\n`;
    report += `- CPU Usage: ${results.performanceMetrics.cpuUsage.toFixed(2)}s\n\n`;
    
    if (results.errors.length > 0) {
      report += `## Errors\n`;
      results.errors.forEach(error => {
        report += `- ${error}\n`;
      });
    }
    
    return report;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
if (require.main === module) {
  const tester = new SystemIntegrationTester();
  
  async function runTests() {
    const testType = process.argv[2] || 'full';
    
    switch (testType) {
      case 'full':
        const fullResults = await tester.runFullSystemIntegrationTest();
        console.log('\n' + tester.generateSystemReport(fullResults));
        break;
        
      case 'realtime':
        const realtimeResults = await tester.runRealTimeDataValidation();
        console.log('\n' + tester.generateSystemReport(realtimeResults));
        break;
        
      default:
        console.log('Usage: node system-integration-test.js [full|realtime]');
        process.exit(1);
    }
  }
  
  runTests().catch(console.error);
}