import { createClient } from 'redis';
import { InfluxDB } from '@influxdata/influxdb-client';
import { PLCMessage } from '@factory-dashboard/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ChaosTestConfig {
  testDuration: number; // seconds
  dataGenerationRate: number; // messages per second
  failureScenarios: FailureScenario[];
}

interface FailureScenario {
  name: string;
  type: 'service_restart' | 'network_partition' | 'resource_exhaustion' | 'data_corruption';
  target: string; // service name or resource
  duration: number; // seconds
  startTime: number; // seconds from test start
}

interface ChaosTestResults {
  testName: string;
  duration: number;
  totalMessages: number;
  messagesProcessed: number;
  messagesLost: number;
  averageRecoveryTime: number;
  maxRecoveryTime: number;
  dataConsistencyScore: number;
  serviceAvailability: { [service: string]: number };
  errors: string[];
}

export class ChaosTestRunner {
  private redisClient: any;
  private influxDB: InfluxDB;
  private queryApi: any;
  private testStartTime: number = 0;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private serviceFaults: { [service: string]: number } = {};
  private recoveryTimes: number[] = [];

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
  }

  async runChaosTest(config: ChaosTestConfig): Promise<ChaosTestResults> {
    console.log(`Starting chaos test for ${config.testDuration} seconds...`);
    
    await this.redisClient.connect();
    this.testStartTime = Date.now();
    
    // Initialize counters
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.serviceFaults = {};
    this.recoveryTimes = [];

    // Start data generation
    const dataGenerator = this.startDataGeneration(config.dataGenerationRate);
    
    // Start monitoring
    const monitoring = this.startServiceMonitoring();
    
    // Execute failure scenarios
    const failurePromises = config.failureScenarios.map(scenario => 
      this.scheduleFailureScenario(scenario)
    );

    // Wait for test duration
    await this.sleep(config.testDuration * 1000);

    // Stop data generation
    clearInterval(dataGenerator);
    
    // Stop monitoring
    clearInterval(monitoring);

    // Wait for any ongoing failure scenarios
    await Promise.allSettled(failurePromises);

    // Collect results
    const results = await this.collectResults(config);

    await this.redisClient.quit();
    console.log('Chaos test completed');
    
    return results;
  }

  private startDataGeneration(rate: number): NodeJS.Timeout {
    const interval = 1000 / rate;
    
    return setInterval(async () => {
      try {
        const equipmentId = `chaos_test_equipment_${this.messagesSent % 10}`;
        const message = this.generateTestMessage(equipmentId);
        
        const queueName = `plc_data_${equipmentId}`;
        await this.redisClient.lPush(queueName, JSON.stringify(message));
        
        this.messagesSent++;
      } catch (error) {
        console.error('Data generation error:', error);
      }
    }, interval);
  }

  private generateTestMessage(equipmentId: string): PLCMessage {
    return {
      id: uuidv4(),
      timestamp: new Date(),
      equipmentId,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'chaos_test_value',
          value: Math.random() * 1000,
          quality: 'GOOD'
        },
        {
          tagId: 'test_sequence',
          value: this.messagesSent,
          quality: 'GOOD'
        },
        {
          tagId: 'generation_time',
          value: Date.now(),
          quality: 'GOOD'
        }
      ]
    };
  }

  private startServiceMonitoring(): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        // Monitor service health
        const services = ['plc-emulator', 'queue-consumer', 'redis', 'influxdb'];
        
        for (const service of services) {
          const isHealthy = await this.checkServiceHealth(service);
          if (!isHealthy) {
            this.serviceFaults[service] = (this.serviceFaults[service] || 0) + 1;
          }
        }

        // Count processed messages
        this.messagesReceived = await this.countProcessedMessages();
        
      } catch (error) {
        console.error('Monitoring error:', error);
      }
    }, 5000);
  }

  private async checkServiceHealth(service: string): Promise<boolean> {
    try {
      switch (service) {
        case 'plc-emulator':
          const plcUrl = process.env.PLC_EMULATOR_URL || 'http://localhost:3000';
          const plcResponse = await fetch(`${plcUrl}/health`);
          return plcResponse.ok;
          
        case 'queue-consumer':
          const consumerUrl = process.env.QUEUE_CONSUMER_URL || 'http://localhost:8080';
          const consumerResponse = await fetch(`${consumerUrl}/health`);
          return consumerResponse.ok;
          
        case 'redis':
          await this.redisClient.ping();
          return true;
          
        case 'influxdb':
          const query = 'buckets() |> limit(n:1)';
          await this.queryApi.collectRows(query);
          return true;
          
        default:
          return true;
      }
    } catch (error) {
      return false;
    }
  }

  private async countProcessedMessages(): Promise<number> {
    try {
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'factory-data-test'}")
          |> range(start: ${new Date(this.testStartTime).toISOString()})
          |> filter(fn: (r) => r._measurement == "test_data")
          |> filter(fn: (r) => r.tag_id == "test_sequence")
          |> count()
      `;

      const result = await this.queryApi.collectRows(query);
      return result.length > 0 ? result[0]._value : 0;
    } catch (error) {
      console.error('Error counting processed messages:', error);
      return 0;
    }
  }

  private async scheduleFailureScenario(scenario: FailureScenario): Promise<void> {
    // Wait for start time
    await this.sleep(scenario.startTime * 1000);
    
    console.log(`Executing failure scenario: ${scenario.name}`);
    const startTime = Date.now();
    
    try {
      await this.executeFailureScenario(scenario);
      
      // Wait for failure duration
      await this.sleep(scenario.duration * 1000);
      
      // Recover from failure
      await this.recoverFromFailure(scenario);
      
      // Measure recovery time
      const recoveryTime = Date.now() - startTime - (scenario.duration * 1000);
      this.recoveryTimes.push(recoveryTime);
      
    } catch (error) {
      console.error(`Failed to execute scenario ${scenario.name}:`, error);
    }
  }

  private async executeFailureScenario(scenario: FailureScenario): Promise<void> {
    switch (scenario.type) {
      case 'service_restart':
        await this.restartService(scenario.target);
        break;
        
      case 'network_partition':
        await this.createNetworkPartition(scenario.target);
        break;
        
      case 'resource_exhaustion':
        await this.exhaustResources(scenario.target);
        break;
        
      case 'data_corruption':
        await this.corruptData(scenario.target);
        break;
        
      default:
        throw new Error(`Unknown failure type: ${scenario.type}`);
    }
  }

  private async restartService(serviceName: string): Promise<void> {
    const containerName = `factory-${serviceName}-test`;
    await execAsync(`docker restart ${containerName}`);
    console.log(`Restarted service: ${serviceName}`);
  }

  private async createNetworkPartition(serviceName: string): Promise<void> {
    const containerName = `factory-${serviceName}-test`;
    await execAsync(`docker network disconnect factory-test-network ${containerName}`);
    console.log(`Network partition created for: ${serviceName}`);
  }

  private async exhaustResources(resourceType: string): Promise<void> {
    switch (resourceType) {
      case 'cpu':
        // Simulate CPU exhaustion
        await execAsync('docker run --rm --name cpu-stress -d stress:latest stress --cpu 4');
        break;
      case 'memory':
        // Simulate memory exhaustion
        await execAsync('docker run --rm --name memory-stress -d stress:latest stress --vm 1 --vm-bytes 1G');
        break;
      case 'disk':
        // Simulate disk exhaustion
        await execAsync('docker run --rm --name disk-stress -d stress:latest stress --io 4');
        break;
    }
    console.log(`Resource exhaustion initiated: ${resourceType}`);
  }

  private async corruptData(target: string): Promise<void> {
    if (target === 'redis') {
      // Inject invalid data into Redis
      await this.redisClient.lPush('plc_data_corrupt', 'invalid_json_data');
    } else if (target === 'influxdb') {
      // This would require more complex implementation
      console.log('Data corruption simulation for InfluxDB');
    }
  }

  private async recoverFromFailure(scenario: FailureScenario): Promise<void> {
    switch (scenario.type) {
      case 'service_restart':
        // Service should auto-recover
        break;
        
      case 'network_partition':
        const containerName = `factory-${scenario.target}-test`;
        await execAsync(`docker network connect factory-test-network ${containerName}`);
        console.log(`Network partition recovered for: ${scenario.target}`);
        break;
        
      case 'resource_exhaustion':
        await this.stopResourceExhaustion(scenario.target);
        break;
        
      case 'data_corruption':
        await this.cleanupCorruptedData(scenario.target);
        break;
    }
  }

  private async stopResourceExhaustion(resourceType: string): Promise<void> {
    try {
      switch (resourceType) {
        case 'cpu':
          await execAsync('docker stop cpu-stress');
          break;
        case 'memory':
          await execAsync('docker stop memory-stress');
          break;
        case 'disk':
          await execAsync('docker stop disk-stress');
          break;
      }
      console.log(`Resource exhaustion stopped: ${resourceType}`);
    } catch (error) {
      // Container might already be stopped
    }
  }

  private async cleanupCorruptedData(target: string): Promise<void> {
    if (target === 'redis') {
      await this.redisClient.del('plc_data_corrupt');
    }
    console.log(`Corrupted data cleaned up for: ${target}`);
  }

  private async collectResults(config: ChaosTestConfig): Promise<ChaosTestResults> {
    const duration = (Date.now() - this.testStartTime) / 1000;
    
    // Calculate data consistency score
    const dataConsistencyScore = await this.calculateDataConsistencyScore();
    
    // Calculate service availability
    const serviceAvailability: { [service: string]: number } = {};
    for (const [service, faults] of Object.entries(this.serviceFaults)) {
      const totalChecks = Math.floor(duration / 5); // 5-second intervals
      serviceAvailability[service] = ((totalChecks - faults) / totalChecks) * 100;
    }

    return {
      testName: `Chaos Test - ${config.failureScenarios.length} scenarios`,
      duration,
      totalMessages: this.messagesSent,
      messagesProcessed: this.messagesReceived,
      messagesLost: this.messagesSent - this.messagesReceived,
      averageRecoveryTime: this.recoveryTimes.length > 0 ? 
        this.recoveryTimes.reduce((sum, time) => sum + time, 0) / this.recoveryTimes.length : 0,
      maxRecoveryTime: this.recoveryTimes.length > 0 ? Math.max(...this.recoveryTimes) : 0,
      dataConsistencyScore,
      serviceAvailability,
      errors: [] // Would collect errors during test
    };
  }

  private async calculateDataConsistencyScore(): Promise<number> {
    try {
      // Check for data gaps, duplicates, and out-of-order messages
      const query = `
        from(bucket: "${process.env.INFLUXDB_BUCKET || 'factory-data-test'}")
          |> range(start: ${new Date(this.testStartTime).toISOString()})
          |> filter(fn: (r) => r._measurement == "test_data")
          |> filter(fn: (r) => r.tag_id == "test_sequence")
          |> sort(columns: ["_time"])
      `;

      const result = await this.queryApi.collectRows(query);
      
      if (result.length === 0) return 0;
      
      let consistentMessages = 0;
      let lastSequence = -1;
      
      for (const row of result) {
        const sequence = parseInt(row._value);
        if (sequence === lastSequence + 1) {
          consistentMessages++;
        }
        lastSequence = sequence;
      }
      
      return (consistentMessages / result.length) * 100;
    } catch (error) {
      console.error('Error calculating data consistency:', error);
      return 0;
    }
  }

  async runPredefinedScenarios(): Promise<ChaosTestResults[]> {
    const scenarios = [
      {
        name: 'Service Restart Test',
        config: {
          testDuration: 300, // 5 minutes
          dataGenerationRate: 50,
          failureScenarios: [
            {
              name: 'Restart PLC Emulator',
              type: 'service_restart' as const,
              target: 'plc-emulator',
              duration: 10,
              startTime: 60
            },
            {
              name: 'Restart Queue Consumer',
              type: 'service_restart' as const,
              target: 'queue-consumer',
              duration: 15,
              startTime: 180
            }
          ]
        }
      },
      {
        name: 'Network Partition Test',
        config: {
          testDuration: 240, // 4 minutes
          dataGenerationRate: 30,
          failureScenarios: [
            {
              name: 'Partition Redis',
              type: 'network_partition' as const,
              target: 'redis',
              duration: 30,
              startTime: 60
            },
            {
              name: 'Partition InfluxDB',
              type: 'network_partition' as const,
              target: 'influxdb',
              duration: 20,
              startTime: 150
            }
          ]
        }
      },
      {
        name: 'Resource Exhaustion Test',
        config: {
          testDuration: 180, // 3 minutes
          dataGenerationRate: 100,
          failureScenarios: [
            {
              name: 'CPU Exhaustion',
              type: 'resource_exhaustion' as const,
              target: 'cpu',
              duration: 30,
              startTime: 30
            },
            {
              name: 'Memory Exhaustion',
              type: 'resource_exhaustion' as const,
              target: 'memory',
              duration: 25,
              startTime: 90
            }
          ]
        }
      }
    ];

    const results: ChaosTestResults[] = [];
    
    for (const scenario of scenarios) {
      console.log(`Running scenario: ${scenario.name}`);
      const result = await this.runChaosTest(scenario.config);
      results.push(result);
      
      // Wait between scenarios
      await this.sleep(30000);
    }
    
    return results;
  }

  generateReport(results: ChaosTestResults[]): string {
    let report = '# Chaos Testing Report\n\n';
    
    results.forEach((result, index) => {
      report += `## ${result.testName}\n`;
      report += `- Duration: ${result.duration.toFixed(2)} seconds\n`;
      report += `- Messages Sent: ${result.totalMessages}\n`;
      report += `- Messages Processed: ${result.messagesProcessed}\n`;
      report += `- Messages Lost: ${result.messagesLost}\n`;
      report += `- Loss Rate: ${((result.messagesLost / result.totalMessages) * 100).toFixed(2)}%\n`;
      report += `- Average Recovery Time: ${result.averageRecoveryTime.toFixed(2)}ms\n`;
      report += `- Max Recovery Time: ${result.maxRecoveryTime.toFixed(2)}ms\n`;
      report += `- Data Consistency Score: ${result.dataConsistencyScore.toFixed(2)}%\n`;
      
      report += '\n### Service Availability:\n';
      for (const [service, availability] of Object.entries(result.serviceAvailability)) {
        report += `- ${service}: ${availability.toFixed(2)}%\n`;
      }
      
      report += '\n';
    });
    
    return report;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
if (require.main === module) {
  const runner = new ChaosTestRunner();
  
  async function runTests() {
    const testType = process.argv[2] || 'predefined';
    
    if (testType === 'predefined') {
      const results = await runner.runPredefinedScenarios();
      console.log('\n' + runner.generateReport(results));
    } else {
      console.log('Usage: node chaos-test-runner.js [predefined]');
      process.exit(1);
    }
  }
  
  runTests().catch(console.error);
}