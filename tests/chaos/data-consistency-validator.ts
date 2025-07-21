import { createClient } from 'redis';
import { InfluxDB } from '@influxdata/influxdb-client';

interface ConsistencyTestResults {
  totalMessages: number;
  processedMessages: number;
  duplicateMessages: number;
  outOfOrderMessages: number;
  missingMessages: number;
  dataIntegrityScore: number;
  temporalConsistencyScore: number;
  crossServiceConsistencyScore: number;
}

export class DataConsistencyValidator {
  private redisClient: unknown;
  private influxDB: InfluxDB;
  private queryApi: unknown;

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

  async validateDataConsistency(testStartTime: Date, testEndTime: Date): Promise<ConsistencyTestResults> {
    await this.redisClient.connect();
    
    console.log('Validating data consistency across service restart...');
    
    // Get all messages from the test period
    const influxMessages = await this.getInfluxMessages(testStartTime, testEndTime);
    const redisMessages = await this.getRedisMessages();
    
    // Analyze consistency
    const results = await this.analyzeConsistency(influxMessages, redisMessages);
    
    await this.redisClient.quit();
    
    return results;
  }

  private async getInfluxMessages(startTime: Date, endTime: Date): Promise<unknown[]> {
    const query = `
      from(bucket: "${process.env.INFLUXDB_BUCKET || 'factory-data-test'}")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "test_data")
        |> filter(fn: (r) => r.tag_id == "test_sequence")
        |> sort(columns: ["_time"])
    `;

    try {
      const result = await this.queryApi.collectRows(query);
      return result;
    } catch {
      console.error('Error querying InfluxDB:', error);
      return [];
    }
  }

  private async getRedisMessages(): Promise<unknown[]> {
    const messages: unknown[] = [];
    
    try {
      // Get all queue names
      const queueNames = await this.redisClient.keys('plc_data_*');
      
      for (const queueName of queueNames) {
        const queueMessages = await this.redisClient.lRange(queueName, 0, -1);
        for (const messageStr of queueMessages) {
          try {
            const message = JSON.parse(messageStr);
            messages.push(message);
          } catch {
            console.error('Error parsing Redis message:', error);
          }
        }
      }
    } catch {
      console.error('Error getting Redis messages:', error);
    }
    
    return messages;
  }

  private async analyzeConsistency(influxMessages: unknown[], redisMessages: unknown[]): Promise<ConsistencyTestResults> {
    // Extract sequence numbers from InfluxDB messages
    const influxSequences = influxMessages.map(msg => parseInt(msg._value)).sort((a, b) => a - b);
    
    // Extract sequence numbers from Redis messages
    const redisSequences = redisMessages
      .map(msg => {
        const sequenceTag = msg.tags?.find((tag: unknown) => tag.tagId === 'test_sequence');
        return sequenceTag ? parseInt(sequenceTag.value) : null;
      })
      .filter(seq => seq !== null)
      .sort((a, b) => a - b);

    // Find duplicates in InfluxDB
    const influxDuplicates = this.findDuplicates(influxSequences);
    
    // Find out-of-order messages
    const outOfOrderMessages = this.findOutOfOrderMessages(influxMessages);
    
    // Find missing messages
    const missingMessages = this.findMissingMessages(influxSequences);
    
    // Calculate scores
    const dataIntegrityScore = this.calculateDataIntegrityScore(influxSequences, redisSequences);
    const temporalConsistencyScore = this.calculateTemporalConsistencyScore(influxMessages);
    const crossServiceConsistencyScore = this.calculateCrossServiceConsistencyScore(influxSequences, redisSequences);

    return {
      totalMessages: Math.max(influxSequences.length, redisSequences.length),
      processedMessages: influxSequences.length,
      duplicateMessages: influxDuplicates.length,
      outOfOrderMessages: outOfOrderMessages.length,
      missingMessages: missingMessages.length,
      dataIntegrityScore,
      temporalConsistencyScore,
      crossServiceConsistencyScore
    };
  }

  private findDuplicates(sequences: number[]): number[] {
    const seen = new Set();
    const duplicates: number[] = [];
    
    for (const seq of sequences) {
      if (seen.has(seq)) {
        duplicates.push(seq);
      } else {
        seen.add(seq);
      }
    }
    
    return duplicates;
  }

  private findOutOfOrderMessages(messages: unknown[]): unknown[] {
    const outOfOrder: unknown[] = [];
    
    for (let i = 1; i < messages.length; i++) {
      const currentTime = new Date(messages[i]._time);
      const previousTime = new Date(messages[i - 1]._time);
      const currentSeq = parseInt(messages[i]._value);
      const previousSeq = parseInt(messages[i - 1]._value);
      
      // Check if sequence number is out of order relative to timestamp
      if (currentSeq < previousSeq && currentTime > previousTime) {
        outOfOrder.push(messages[i]);
      }
    }
    
    return outOfOrder;
  }

  private findMissingMessages(sequences: number[]): number[] {
    if (sequences.length === 0) return [];
    
    const missing: number[] = [];
    const min = Math.min(...sequences);
    const max = Math.max(...sequences);
    
    for (let i = min; i <= max; i++) {
      if (!sequences.includes(i)) {
        missing.push(i);
      }
    }
    
    return missing;
  }

  private calculateDataIntegrityScore(influxSequences: number[], redisSequences: number[]): number {
    if (influxSequences.length === 0 && redisSequences.length === 0) return 100;
    
    const totalExpected = Math.max(...influxSequences, ...redisSequences);
    const actualProcessed = influxSequences.length;
    
    return (actualProcessed / totalExpected) * 100;
  }

  private calculateTemporalConsistencyScore(messages: unknown[]): number {
    if (messages.length < 2) return 100;
    
    let consistentMessages = 0;
    
    for (let i = 1; i < messages.length; i++) {
      const currentTime = new Date(messages[i]._time);
      const previousTime = new Date(messages[i - 1]._time);
      const currentSeq = parseInt(messages[i]._value);
      const previousSeq = parseInt(messages[i - 1]._value);
      
      // Check if sequence and timestamp are consistent
      if (currentSeq > previousSeq && currentTime >= previousTime) {
        consistentMessages++;
      }
    }
    
    return (consistentMessages / (messages.length - 1)) * 100;
  }

  private calculateCrossServiceConsistencyScore(influxSequences: number[], redisSequences: number[]): number {
    if (influxSequences.length === 0 && redisSequences.length === 0) return 100;
    
    const influxSet = new Set(influxSequences);
    const redisSet = new Set(redisSequences);
    
    // Calculate intersection and union
    const intersection = [...influxSet].filter(seq => redisSet.has(seq));
    const union = [...new Set([...influxSet, ...redisSet])];
    
    return (intersection.length / union.length) * 100;
  }

  async runServiceRestartConsistencyTest(): Promise<ConsistencyTestResults> {
    console.log('Running service restart consistency test...');
    
    const testStartTime = new Date();
    
    // Start data generation
    const dataGenerationInterval = setInterval(async () => {
      try {
        const equipmentId = 'consistency_test_equipment';
        const message = {
          id: `msg_${Date.now()}`,
          timestamp: new Date(),
          equipmentId,
          messageType: 'DATA_UPDATE',
          tags: [
            {
              tagId: 'test_sequence',
              value: Math.floor(Math.random() * 10000),
              quality: 'GOOD'
            }
          ]
        };
        
        await this.redisClient.lPush(`plc_data_${equipmentId}`, JSON.stringify(message));
      } catch {
        console.error('Data generation error:', error);
      }
    }, 1000);

    // Run for 2 minutes
    await this.sleep(120000);
    
    clearInterval(dataGenerationInterval);
    
    const testEndTime = new Date();
    
    // Validate consistency
    const results = await this.validateDataConsistency(testStartTime, testEndTime);
    
    return results;
  }

  generateConsistencyReport(results: ConsistencyTestResults): string {
    let report = '# Data Consistency Validation Report\n\n';
    
    report += `## Summary\n`;
    report += `- Total Messages: ${results.totalMessages}\n`;
    report += `- Processed Messages: ${results.processedMessages}\n`;
    report += `- Duplicate Messages: ${results.duplicateMessages}\n`;
    report += `- Out-of-Order Messages: ${results.outOfOrderMessages}\n`;
    report += `- Missing Messages: ${results.missingMessages}\n\n`;
    
    report += `## Consistency Scores\n`;
    report += `- Data Integrity Score: ${results.dataIntegrityScore.toFixed(2)}%\n`;
    report += `- Temporal Consistency Score: ${results.temporalConsistencyScore.toFixed(2)}%\n`;
    report += `- Cross-Service Consistency Score: ${results.crossServiceConsistencyScore.toFixed(2)}%\n\n`;
    
    report += `## Analysis\n`;
    
    if (results.dataIntegrityScore > 95) {
      report += `✅ Data integrity is excellent\n`;
    } else if (results.dataIntegrityScore > 80) {
      report += `⚠️ Data integrity is acceptable but could be improved\n`;
    } else {
      report += `❌ Data integrity issues detected\n`;
    }
    
    if (results.temporalConsistencyScore > 95) {
      report += `✅ Temporal consistency is excellent\n`;
    } else if (results.temporalConsistencyScore > 80) {
      report += `⚠️ Temporal consistency issues detected\n`;
    } else {
      report += `❌ Significant temporal consistency problems\n`;
    }
    
    if (results.crossServiceConsistencyScore > 95) {
      report += `✅ Cross-service consistency is excellent\n`;
    } else if (results.crossServiceConsistencyScore > 80) {
      report += `⚠️ Cross-service consistency could be improved\n`;
    } else {
      report += `❌ Cross-service consistency issues detected\n`;
    }
    
    return report;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
if (require.main === module) {
  const validator = new DataConsistencyValidator();
  
  async function runValidation() {
    const results = await validator.runServiceRestartConsistencyTest();
    console.log('\n' + validator.generateConsistencyReport(results));
  }
  
  runValidation().catch(console.error);
}