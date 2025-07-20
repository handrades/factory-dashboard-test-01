import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { InfluxDBConfig, DataPoint, WriteOptions } from '@factory-dashboard/shared-types';
import { EventEmitter } from 'events';
import winston, { createLogger } from 'winston';

export class InfluxDBClient extends EventEmitter {
  private client: InfluxDB;
  private writeApi: WriteApi;
  private queryApi: QueryApi;
  private config: InfluxDBConfig;
  private writeOptions: WriteOptions;
  private logger: ReturnType<typeof createLogger>;
  private writeBuffer: Point[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isConnected: boolean = false;
  private pointsWritten: number = 0;
  private writeErrors: number = 0;

  constructor(config: InfluxDBConfig, writeOptions: WriteOptions) {
    super();
    this.config = config;
    this.writeOptions = writeOptions;
    
    this.logger = createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'influxdb-client.log' })
      ]
    });

    this.client = new InfluxDB({
      url: config.url,
      token: config.token,
      timeout: config.timeout
    });

    this.writeApi = this.client.getWriteApi(config.org, config.bucket);
    this.queryApi = this.client.getQueryApi(config.org);

    this.setupWriteApi();
    this.startFlushTimer();
  }

  private setupWriteApi(): void {
    // Configure write options
    this.writeApi.useDefaultTags({
      source: 'plc-emulator'
    });

    // Set up event handlers
    this.writeApi.writeRecord = this.writeApi.writeRecord.bind(this.writeApi);
    
    // Handle write errors
    try {
      (this.writeApi as unknown).on?.('error', (error: unknown) => {
        this.logger.error(`InfluxDB write error: ${error}`);
        this.writeErrors++;
        this.emit('writeError', error);
      });
    } catch {
      this.logger.debug('WriteApi event handling not available');
    }
  }

  async connect(): Promise<void> {
    try {
      // Test connection with a simple query
      await this.queryApi.collectRows('buckets()');
      this.isConnected = true;
      this.logger.info('Successfully connected to InfluxDB');
      this.emit('connected');
    } catch {
      this.isConnected = false;
      this.logger.error(`Failed to connect to InfluxDB: ${error}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush any remaining points
    await this.flushBuffer();

    try {
      await this.writeApi.close();
      this.isConnected = false;
      this.logger.info('Disconnected from InfluxDB');
      this.emit('disconnected');
    } catch {
      this.logger.error(`Error disconnecting from InfluxDB: ${error}`);
    }
  }

  async writeDataPoint(dataPoint: DataPoint): Promise<void> {
    try {
      const point = this.createInfluxPoint(dataPoint);
      this.writeBuffer.push(point);

      // Flush buffer if it reaches batch size
      if (this.writeBuffer.length >= this.writeOptions.batchSize) {
        await this.flushBuffer();
      }
    } catch {
      this.logger.error(`Error writing data point: ${error}`);
      throw error;
    }
  }

  async writeDataPoints(dataPoints: DataPoint[]): Promise<void> {
    try {
      for (const dataPoint of dataPoints) {
        const point = this.createInfluxPoint(dataPoint);
        this.writeBuffer.push(point);
      }

      // Flush buffer if it reaches batch size
      if (this.writeBuffer.length >= this.writeOptions.batchSize) {
        await this.flushBuffer();
      }
    } catch {
      this.logger.error(`Error writing data points: ${error}`);
      throw error;
    }
  }

  private createInfluxPoint(dataPoint: DataPoint): Point {
    const point = new Point(dataPoint.measurement);

    // Add tags
    for (const [key, value] of Object.entries(dataPoint.tags)) {
      point.tag(key, value);
    }

    // Add fields
    for (const [key, value] of Object.entries(dataPoint.fields)) {
      if (typeof value === 'number') {
        point.floatField(key, value);
      } else if (typeof value === 'boolean') {
        point.booleanField(key, value);
      } else if (typeof value === 'string') {
        point.stringField(key, value);
      } else if (typeof value === 'bigint') {
        point.intField(key, Number(value));
      }
    }

    // Set timestamp
    point.timestamp(dataPoint.timestamp);

    return point;
  }

  private async flushBuffer(): Promise<void> {
    if (this.writeBuffer.length === 0) {
      return;
    }

    const pointsToWrite = [...this.writeBuffer];
    this.writeBuffer = [];

    try {
      await this.writeWithRetry(pointsToWrite);
      this.pointsWritten += pointsToWrite.length;
      this.logger.debug(`Successfully wrote ${pointsToWrite.length} points to InfluxDB`);
    } catch {
      this.logger.error(`Failed to write ${pointsToWrite.length} points to InfluxDB: ${error}`);
      this.writeErrors += pointsToWrite.length;
      
      // Put points back in buffer for retry (with limit to prevent memory issues)
      if (this.writeBuffer.length < 10000) {
        this.writeBuffer.unshift(...pointsToWrite);
      }
      
      throw error;
    }
  }

  private async writeWithRetry(points: Point[]): Promise<void> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.writeOptions.retryAttempts; attempt++) {
      try {
        this.writeApi.writePoints(points);
        await this.writeApi.flush();
        return; // Success
      } catch {
        lastError = error as Error;
        this.logger.warn(`Write attempt ${attempt} failed: ${error}`);
        
        if (attempt < this.writeOptions.retryAttempts) {
          await this.sleep(this.writeOptions.retryDelay * Math.pow(2, attempt - 1));
        }
      }
    }
    
    throw lastError;
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flushBuffer();
      } catch {
        this.logger.error(`Error during scheduled flush: ${error}`);
      }
    }, this.writeOptions.flushInterval);
  }

  async query(fluxQuery: string): Promise<unknown[]> {
    try {
      const result = await this.queryApi.collectRows(fluxQuery);
      return result;
    } catch {
      this.logger.error(`Query error: ${error}`);
      throw error;
    }
  }

  async getLatestEquipmentData(equipmentId: string, timeRange: string = '1h'): Promise<unknown[]> {
    const query = `
      from(bucket: "${this.config.bucket}")
        |> range(start: -${timeRange})
        |> filter(fn: (r) => r.equipment_id == "${equipmentId}")
        |> group(columns: ["_measurement", "_field"])
        |> last()
    `;

    return this.query(query);
  }

  async getEquipmentTimeSeries(
    equipmentId: string,
    measurement: string,
    field: string,
    timeRange: string = '1h',
    interval: string = '1m'
  ): Promise<unknown[]> {
    const query = `
      from(bucket: "${this.config.bucket}")
        |> range(start: -${timeRange})
        |> filter(fn: (r) => r.equipment_id == "${equipmentId}")
        |> filter(fn: (r) => r._measurement == "${measurement}")
        |> filter(fn: (r) => r._field == "${field}")
        |> aggregateWindow(every: ${interval}, fn: mean, createEmpty: false)
        |> yield(name: "mean")
    `;

    return this.query(query);
  }

  async getEquipmentMetrics(equipmentIds: string[], timeRange: string = '1h'): Promise<unknown[]> {
    const equipmentFilter = equipmentIds.map(id => `r.equipment_id == "${id}"`).join(' or ');
    
    const query = `
      from(bucket: "${this.config.bucket}")
        |> range(start: -${timeRange})
        |> filter(fn: (r) => ${equipmentFilter})
        |> group(columns: ["equipment_id", "_measurement", "_field"])
        |> last()
    `;

    return this.query(query);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.queryApi.collectRows('buckets() |> limit(n: 1)');
      return true;
    } catch {
      this.logger.error(`Connection test failed: ${error}`);
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): {
    pointsWritten: number;
    writeErrors: number;
    bufferSize: number;
    isConnected: boolean;
  } {
    return {
      pointsWritten: this.pointsWritten,
      writeErrors: this.writeErrors,
      bufferSize: this.writeBuffer.length,
      isConnected: this.isConnected
    };
  }

  forceFlush(): Promise<void> {
    return this.flushBuffer();
  }
}