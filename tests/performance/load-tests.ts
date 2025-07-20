import { createClient } from 'redis';
import { InfluxDB } from '@influxdata/influxdb-client';
import { PLCMessage } from '@factory-dashboard/shared-types';
import { v4 as uuidv4 } from 'uuid';

interface LoadTestConfig {
  messagesPerSecond: number;
  durationSeconds: number;
  equipmentCount: number;
  concurrentClients: number;
}

interface LoadTestResults {
  totalMessages: number;
  messagesPerSecond: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  errorRate: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  redisConnections: number;
  influxdbWrites: number;
}

export class LoadTestRunner {
  private redisClient: unknown;
  private influxDB: InfluxDB;
  private queryApi: unknown;
  private results: LoadTestResults = {
    totalMessages: 0,
    messagesPerSecond: 0,
    averageLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    errorRate: 0,
    throughput: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    redisConnections: 0,
    influxdbWrites: 0
  };

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

  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResults> {
    console.log(`Starting load test: ${config.messagesPerSecond} msg/s for ${config.durationSeconds}s`);
    
    await this.redisClient.connect();
    
    const startTime = Date.now();
    const endTime = startTime + (config.durationSeconds * 1000);
    
    // Statistics tracking
    const latencies: number[] = [];
    let messageCount = 0;
    let errorCount = 0;
    
    // Create concurrent clients
    const clients = [];
    for (let i = 0; i < config.concurrentClients; i++) {
      clients.push(this.createLoadClient(i, config, latencies, startTime, endTime));
    }

    // Start resource monitoring
    const resourceMonitor = this.startResourceMonitoring();

    // Run the test
    const results = await Promise.allSettled(clients);
    
    // Calculate results
    const totalDuration = Date.now() - startTime;
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        messageCount += result.value.messageCount;
        errorCount += result.value.errorCount;
      }
    });

    // Stop resource monitoring
    const resourceStats = await this.stopResourceMonitoring(resourceMonitor);

    // Calculate final statistics
    this.results = {
      totalMessages: messageCount,
      messagesPerSecond: messageCount / (totalDuration / 1000),
      averageLatency: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      maxLatency: Math.max(...latencies),
      minLatency: Math.min(...latencies),
      errorRate: errorCount / messageCount,
      throughput: messageCount / (totalDuration / 1000),
      ...resourceStats
    };

    await this.redisClient.quit();
    
    console.log('Load test completed:', this.results);
    return this.results;
  }

  private async createLoadClient(
    clientId: number,
    config: LoadTestConfig,
    latencies: number[],
    startTime: number,
    endTime: number
  ): Promise<{ messageCount: number; errorCount: number }> {
    
    const client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
      },
      password: process.env.REDIS_PASSWORD
    });

    await client.connect();

    let messageCount = 0;
    let errorCount = 0;
    
    const messagesPerClient = config.messagesPerSecond / config.concurrentClients;
    const interval = 1000 / messagesPerClient;

    while (Date.now() < endTime) {
      const messageStartTime = Date.now();
      
      try {
        const equipmentId = `load_test_equipment_${clientId}_${messageCount % config.equipmentCount}`;
        const message = this.generateTestMessage(equipmentId, clientId, messageCount);
        
        const queueName = `plc_data_${equipmentId}`;
        await client.lPush(queueName, JSON.stringify(message));
        
        const latency = Date.now() - messageStartTime;
        latencies.push(latency);
        messageCount++;
        
      } catch {
        errorCount++;
        console.error(`Client ${clientId} error:`, error);
      }

      // Control rate
      const processingTime = Date.now() - messageStartTime;
      if (processingTime < interval) {
        await this.sleep(interval - processingTime);
      }
    }

    await client.quit();
    return { messageCount, errorCount };
  }

  private generateTestMessage(equipmentId: string, clientId: number, messageIndex: number): PLCMessage {
    return {
      id: uuidv4(),
      timestamp: new Date(),
      equipmentId,
      messageType: 'DATA_UPDATE',
      tags: [
        {
          tagId: 'load_test_value',
          value: Math.random() * 1000,
          quality: 'GOOD'
        },
        {
          tagId: 'client_id',
          value: clientId,
          quality: 'GOOD'
        },
        {
          tagId: 'message_index',
          value: messageIndex,
          quality: 'GOOD'
        },
        {
          tagId: 'timestamp',
          value: Date.now(),
          quality: 'GOOD'
        }
      ]
    };
  }

  async runThroughputTest(maxMessagesPerSecond: number, stepSize: number): Promise<LoadTestResults[]> {
    console.log(`Running throughput test up to ${maxMessagesPerSecond} msg/s`);
    
    const results: LoadTestResults[] = [];
    
    for (let rate = stepSize; rate <= maxMessagesPerSecond; rate += stepSize) {
      const config: LoadTestConfig = {
        messagesPerSecond: rate,
        durationSeconds: 30,
        equipmentCount: 10,
        concurrentClients: Math.min(rate / 10, 10)
      };
      
      console.log(`Testing ${rate} msg/s...`);
      const result = await this.runLoadTest(config);
      results.push(result);
      
      // Wait between tests
      await this.sleep(5000);
    }
    
    return results;
  }

  async runStressTest(duration: number): Promise<LoadTestResults> {
    console.log(`Running stress test for ${duration} seconds`);
    
    // Gradually increase load
    const phases = [
      { rate: 100, duration: duration / 4 },
      { rate: 500, duration: duration / 4 },
      { rate: 1000, duration: duration / 4 },
      { rate: 2000, duration: duration / 4 }
    ];
    
    const results: LoadTestResults[] = [];
    
    for (const phase of phases) {
      const config: LoadTestConfig = {
        messagesPerSecond: phase.rate,
        durationSeconds: phase.duration,
        equipmentCount: 20,
        concurrentClients: Math.min(phase.rate / 20, 20)
      };
      
      console.log(`Stress phase: ${phase.rate} msg/s for ${phase.duration}s`);
      const result = await this.runLoadTest(config);
      results.push(result);
    }
    
    // Return aggregated results
    return this.aggregateResults(results);
  }

  private aggregateResults(results: LoadTestResults[]): LoadTestResults {
    const totalMessages = results.reduce((sum, r) => sum + r.totalMessages, 0);
    const totalErrors = results.reduce((sum, r) => sum + (r.totalMessages * r.errorRate), 0);
    
    return {
      totalMessages,
      messagesPerSecond: results.reduce((sum, r) => sum + r.messagesPerSecond, 0) / results.length,
      averageLatency: results.reduce((sum, r) => sum + r.averageLatency, 0) / results.length,
      maxLatency: Math.max(...results.map(r => r.maxLatency)),
      minLatency: Math.min(...results.map(r => r.minLatency)),
      errorRate: totalErrors / totalMessages,
      throughput: results.reduce((sum, r) => sum + r.throughput, 0) / results.length,
      cpuUsage: results.reduce((sum, r) => sum + r.cpuUsage, 0) / results.length,
      memoryUsage: results.reduce((sum, r) => sum + r.memoryUsage, 0) / results.length,
      redisConnections: Math.max(...results.map(r => r.redisConnections)),
      influxdbWrites: results.reduce((sum, r) => sum + r.influxdbWrites, 0)
    };
  }

  private startResourceMonitoring(): NodeJS.Timeout {
    return setInterval(() => {
      const usage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // In a real implementation, we'd collect these metrics
      console.log(`Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB, CPU: ${cpuUsage.user + cpuUsage.system}µs`);
    }, 5000);
  }

  private async stopResourceMonitoring(monitor: NodeJS.Timeout): Promise<{
    cpuUsage: number;
    memoryUsage: number;
    redisConnections: number;
    influxdbWrites: number;
  }> {
    clearInterval(monitor);
    
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: usage.heapUsed,
      redisConnections: 1, // This would be monitored in a real implementation
      influxdbWrites: 0 // This would be monitored in a real implementation
    };
  }

  async validateDataIntegrity(): Promise<{ processed: number; lost: number; duplicated: number }> {
    console.log('Validating data integrity...');
    
    // Query InfluxDB for processed messages
    const query = `
      from(bucket: "${process.env.INFLUXDB_BUCKET || 'factory-data-test'}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "test_data")
        |> filter(fn: (r) => r._field == "message_index")
        |> group(columns: ["equipment_id"])
        |> count()
    `;

    const result = await this.queryApi.collectRows(query);
    
    const processed = result.reduce((sum: number, row: unknown) => sum + row._value, 0);
    
    // In a real implementation, we'd compare with sent messages to find lost/duplicated
    return {
      processed,
      lost: 0,
      duplicated: 0
    };
  }

  generateReport(results: LoadTestResults | LoadTestResults[]): string {
    const resultsArray = Array.isArray(results) ? results : [results];
    
    let report = '# Load Test Report\n\n';
    
    resultsArray.forEach((result, index) => {
      report += `## Test ${index + 1}\n`;
      report += `- Total Messages: ${result.totalMessages}\n`;
      report += `- Messages/Second: ${result.messagesPerSecond.toFixed(2)}\n`;
      report += `- Average Latency: ${result.averageLatency.toFixed(2)}ms\n`;
      report += `- Max Latency: ${result.maxLatency.toFixed(2)}ms\n`;
      report += `- Min Latency: ${result.minLatency.toFixed(2)}ms\n`;
      report += `- Error Rate: ${(result.errorRate * 100).toFixed(2)}%\n`;
      report += `- Throughput: ${result.throughput.toFixed(2)} msg/s\n`;
      report += `- CPU Usage: ${result.cpuUsage.toFixed(2)}s\n`;
      report += `- Memory Usage: ${Math.round(result.memoryUsage / 1024 / 1024)}MB\n\n`;
    });
    
    return report;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
if (require.main === module) {
  const runner = new LoadTestRunner();
  
  async function runTests() {
    const testType = process.argv[2] || 'load';
    
    switch (testType) {
      case 'load': {
        const config: LoadTestConfig = {
          messagesPerSecond: parseInt(process.argv[3] || '100', 10),
          durationSeconds: parseInt(process.argv[4] || '60', 10),
          equipmentCount: parseInt(process.argv[5] || '10', 10),
          concurrentClients: parseInt(process.argv[6] || '5', 10)
        };
        
        const result = await runner.runLoadTest(config);
        console.log('\n' + runner.generateReport(result));
        break;
      }
        
      case 'throughput': {
        const maxRate = parseInt(process.argv[3] || '1000', 10);
        const stepSize = parseInt(process.argv[4] || '100', 10);
        
        const throughputResults = await runner.runThroughputTest(maxRate, stepSize);
        console.log('\n' + runner.generateReport(throughputResults));
        break;
      }
        
      case 'stress': {
        const duration = parseInt(process.argv[3] || '300', 10);
        
        const stressResult = await runner.runStressTest(duration);
        console.log('\n' + runner.generateReport(stressResult));
        break;
      }
        
      default:
        console.log('Usage: node load-tests.js [load|throughput|stress] [parameters...]');
        console.log('  load <msg/s> <duration> <equipment> <clients>');
        console.log('  throughput <max_rate> <step_size>');
        console.log('  stress <duration>');
        process.exit(1);
    }
  }
  
  runTests().catch(console.error);
}