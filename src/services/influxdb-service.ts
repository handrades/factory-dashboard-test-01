import { InfluxDB, type QueryApi } from '@influxdata/influxdb-client';
import type { Equipment } from '../context/FactoryContext';
import { InfluxQueryBuilder } from './influx-query-builder';
// import { secretManager } from '../security/SecretManager';

export interface InfluxDBServiceConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  timeout: number;
}

export interface ConnectionRetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface ConnectionDiagnostics {
  isConnected: boolean;
  lastConnectionAttempt: Date;
  consecutiveFailures: number;
  lastError?: string;
  errorType?: 'network' | 'auth' | 'data' | 'config';
}

export interface EquipmentData {
  equipmentId: string;
  timestamp: Date;
  temperature?: number;
  speed?: number;
  pressure?: number;
  status?: string;
  quality?: string;
  [key: string]: any;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
}

export class InfluxDBService {
  private client: InfluxDB;
  private queryApi: QueryApi;
  private config: InfluxDBServiceConfig;
  private isConnected: boolean = false;
  private connectionCache: Map<string, any> = new Map();
  private cacheTimeout: number = 0; // Disable caching completely for debugging
  private retryConfig: ConnectionRetryConfig;
  private diagnostics: ConnectionDiagnostics;
  private queryBuilder: any;

  constructor(config: InfluxDBServiceConfig, retryConfig?: Partial<ConnectionRetryConfig>) {
    this.config = config;
    this.queryBuilder = new InfluxQueryBuilder();
    
    // Use SecretManager to mask sensitive configuration data
    // const maskedConfig = secretManager.maskSensitiveData({
    //   url: config.url,
    //   token: config.token,
    //   org: config.org,
    //   bucket: config.bucket,
    //   timeout: config.timeout
    // });
    
    console.log('InfluxDBService constructor called with config:', { url: config.url, org: config.org, bucket: config.bucket });
    
    this.client = new InfluxDB({
      url: config.url,
      token: config.token,
      timeout: config.timeout
    });
    this.queryApi = this.client.getQueryApi(config.org);
    
    this.retryConfig = {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      ...retryConfig
    };

    this.diagnostics = {
      isConnected: false,
      lastConnectionAttempt: new Date(),
      consecutiveFailures: 0
    };
  }

  async connect(): Promise<boolean> {
    return this.connectWithRetry();
  }

  async connectWithRetry(customRetryConfig?: Partial<ConnectionRetryConfig>): Promise<boolean> {
    const retryConfig = { ...this.retryConfig, ...customRetryConfig };
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      this.diagnostics.lastConnectionAttempt = new Date();
      
      try {
        // Test connection with a simple query
        const testQuery = 'buckets() |> limit(n: 1)';
        await this.queryApi.collectRows(testQuery);
        this.isConnected = true;
        this.diagnostics.isConnected = true;
        this.diagnostics.consecutiveFailures = 0;
        this.diagnostics.lastError = undefined;
        this.diagnostics.errorType = undefined;
        console.log('Successfully connected to InfluxDB');
        return true;
      } catch (error: any) {
        this.isConnected = false;
        this.diagnostics.isConnected = false;
        this.diagnostics.consecutiveFailures++;
        this.diagnostics.lastError = error.message || 'Unknown error';
        this.diagnostics.errorType = this.categorizeError(error);
        
        const isLastAttempt = attempt === retryConfig.maxRetries;
        
        if (isLastAttempt) {
          console.error(`Failed to connect to InfluxDB after ${retryConfig.maxRetries + 1} attempts:`, error);
          return false;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
          retryConfig.maxDelay
        );
        
        console.warn(`InfluxDB connection attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
        await this.sleep(delay);
      }
    }
    
    return false;
  }

  private categorizeError(error: any): 'network' | 'auth' | 'data' | 'config' {
    if (!error.message) return 'network';
    
    const message = error.message.toLowerCase();
    
    if (message.includes('unauthorized') || message.includes('token') || message.includes('auth')) {
      return 'auth';
    }
    
    if (message.includes('bucket') || message.includes('org') || message.includes('query')) {
      return 'data';
    }
    
    if (message.includes('url') || message.includes('config')) {
      return 'config';
    }
    
    return 'network';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getLatestEquipmentData(equipmentIds: string[]): Promise<EquipmentData[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to InfluxDB');
    }

    try {
      const cacheKey = `latest-${equipmentIds.join(',')}`;
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        console.log(`InfluxDB: Returning cached data for equipment [${equipmentIds.join(', ')}]`, {
          cacheKey,
          dataCount: cached.length,
          cacheAge: Date.now() - (this.connectionCache.get(cacheKey)?.timestamp || 0)
        });
        return cached;
      }

      const query = this.queryBuilder.buildLatestEquipmentDataQuery(
        this.config.bucket,
        equipmentIds,
        '1h'
      );

      console.log(`InfluxDB: Fetching fresh data for equipment [${equipmentIds.join(', ')}]`);
      console.log(`InfluxDB: Line 6 equipment should be: oven6, press6, oven-conveyor6, assembly6`);
      const result = await this.queryApi.collectRows(query);
      
      // Debug logging to understand what data we're getting
      console.log(`InfluxDB query for equipment [${equipmentIds.join(', ')}]:`, query);
      console.log(`InfluxDB raw result (${result.length} rows):`, result.slice(0, 5)); // Log first 5 rows
      
      // Additional debug: log the complete structure of the first few rows
      console.log('Detailed structure of first 3 rows:', JSON.stringify(result.slice(0, 3), null, 2));
      
      console.log('About to call transformQueryResultToEquipmentData with result.length:', result.length);
      const equipmentData = this.transformQueryResultToEquipmentData(result);
      console.log('transformQueryResultToEquipmentData returned:', equipmentData.length, 'equipment items');
      
      console.log(`InfluxDB: Fresh data transformed for equipment:`, equipmentData.map(eq => ({
        id: eq.equipmentId,
        temperature: eq.temperature,
        speed: eq.speed,
        pressure: eq.pressure,
        status: eq.status,
        timestamp: eq.timestamp.toISOString()
      })));
      
      // Force log the complete equipment data to see what's missing
      console.log('COMPLETE EQUIPMENT DATA:', JSON.stringify(equipmentData, null, 2));
      
      this.setCachedResult(cacheKey, equipmentData);
      return equipmentData;
    } catch (error) {
      console.error('Error querying latest equipment data:', error);
      throw error;
    }
  }

  async getEquipmentTimeSeries(
    equipmentId: string,
    measurement: string,
    field: string,
    timeRange: string = '1h',
    interval: string = '1m'
  ): Promise<TimeSeriesData[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to InfluxDB');
    }

    try {
      const cacheKey = `timeseries-${equipmentId}-${measurement}-${field}-${timeRange}-${interval}`;
      const cached = this.getCachedResult(cacheKey);
      if (cached) return cached;

      const query = this.queryBuilder.buildTimeSeriesQuery(
        this.config.bucket,
        equipmentId,
        measurement,
        field,
        timeRange,
        interval,
        'mean'
      );

      const result = await this.queryApi.collectRows(query);
      const timeSeriesData = result.map((row: any) => ({
        timestamp: new Date(row._time),
        value: row._value
      }));
      
      this.setCachedResult(cacheKey, timeSeriesData);
      return timeSeriesData;
    } catch (error) {
      console.error('Error querying time series data:', error);
      throw error;
    }
  }

  async getEquipmentStatus(equipmentIds: string[]): Promise<{ [equipmentId: string]: string }> {
    if (!this.isConnected) {
      throw new Error('Not connected to InfluxDB');
    }

    try {
      const cacheKey = `status-${equipmentIds.join(',')}`;
      const cached = this.getCachedResult(cacheKey);
      if (cached) return cached;

      const queries = this.queryBuilder.buildEquipmentStatusQuery(
        this.config.bucket,
        equipmentIds,
        '10m'
      );
      
      const qualityQuery = queries.qualityQuery;
      const heartbeatQuery = queries.heartbeatQuery;

      // Execute both queries separately to avoid schema collision
      const [qualityResult, heartbeatResult] = await Promise.all([
        this.queryApi.collectRows(qualityQuery),
        this.queryApi.collectRows(heartbeatQuery)
      ]);
      
      // Combine results
      const allResults = [...qualityResult, ...heartbeatResult];
      const statusMap: { [equipmentId: string]: string } = {};
      
      for (const equipmentId of equipmentIds) {
        const equipmentRows = allResults.filter((row: any) => row.equipment_id === equipmentId);
        
        if (equipmentRows.length === 0) {
          statusMap[equipmentId] = 'error'; // No recent data
        } else {
          const latestTimestamp = Math.max(...equipmentRows.map((row: any) => new Date(row._time).getTime()));
          const timeDiff = Date.now() - latestTimestamp;
          
          if (timeDiff > 60000) { // No data for more than 1 minute
            statusMap[equipmentId] = 'error';
          } else if (timeDiff > 30000) { // No data for more than 30 seconds
            statusMap[equipmentId] = 'stopped';
          } else {
            statusMap[equipmentId] = 'running';
          }
        }
      }
      
      this.setCachedResult(cacheKey, statusMap);
      return statusMap;
    } catch (error) {
      console.error('Error querying equipment status:', error);
      throw error;
    }
  }

  async getLineEfficiency(lineId: string, timeRange: string = '1h'): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Not connected to InfluxDB');
    }

    try {
      const cacheKey = `efficiency-${lineId}-${timeRange}`;
      const cached = this.getCachedResult(cacheKey);
      if (cached !== undefined) return cached;

      const query = this.queryBuilder.buildLineEfficiencyQuery(
        this.config.bucket,
        lineId,
        timeRange
      );

      const result = await this.queryApi.collectRows(query);
      const efficiency = result.length > 0 ? ((result[0] as any)._value * 100) : 85; // Default to 85% if no data
      
      this.setCachedResult(cacheKey, efficiency);
      return efficiency;
    } catch (error) {
      console.error('Error querying line efficiency:', error);
      return 85; // Default efficiency
    }
  }

  private transformQueryResultToEquipmentData(result: any[]): EquipmentData[] {
    console.log('🔧 transformQueryResultToEquipmentData called with', result.length, 'rows');
    console.log('First row sample:', result[0]);
    
    const equipmentMap = new Map<string, EquipmentData>();

    for (const row of result) {
      const equipmentId = row.equipment_id;
      
      if (!equipmentId) {
        console.warn('Row missing equipment_id:', row);
        continue;
      }
      
      if (!equipmentMap.has(equipmentId)) {
        equipmentMap.set(equipmentId, {
          equipmentId,
          timestamp: new Date(row._time || Date.now())
        });
      }

      const equipment = equipmentMap.get(equipmentId)!;
      
      // Update timestamp to the latest one
      const rowTime = new Date(row._time || Date.now());
      if (rowTime > equipment.timestamp) {
        equipment.timestamp = rowTime;
      }
      
      // Enhanced field mapping with better type handling  
      const measurement = row._measurement;
      
      // Debug logging to see actual data structure
      console.log(`Processing row for ${equipmentId}: measurement=${measurement}`, row);
      
      // Temperature mapping - after pivot, temperature data has a 'value' column
      if (measurement === 'temperature' && row.value !== undefined) {
        equipment.temperature = this.parseNumericValue(row.value);
        console.log(`🌡️ Set temperature for ${equipmentId}: ${equipment.temperature} (from row.value: ${row.value})`);
      } else if (measurement === 'temperature') {
        console.log(`🌡️ Temperature row for ${equipmentId} but no 'value' field:`, row);
      }
      
      // Speed/conveyor mapping - after pivot, speed data has a 'value' column
      else if ((measurement === 'conveyor_speed' || measurement === 'speed') && row.value !== undefined) {
        equipment.speed = this.parseNumericValue(row.value);
        console.log(`Set speed for ${equipmentId}: ${equipment.speed}`);
      }
      
      // Pressure mapping - after pivot, pressure data has a 'value' column
      else if ((measurement === 'hydraulic_pressure' || measurement === 'pressure') && row.value !== undefined) {
        equipment.pressure = this.parseNumericValue(row.value);
        console.log(`Set pressure for ${equipmentId}: ${equipment.pressure}`);
      }
      
      // Status mapping - after pivot, status data has direct column names
      else if (measurement === 'heating_status' && row.enabled !== undefined) {
        equipment.status = this.parseBooleanValue(row.enabled) ? 'running' : 'stopped';
        console.log(`Set status (heating) for ${equipmentId}: ${equipment.status}`);
      }
      else if (measurement === 'plc_data' && row.current_state !== undefined) {
        equipment.status = this.parseStatusValue(row.current_state);
        console.log(`Set status (plc_data) for ${equipmentId}: ${equipment.status}`);
      }
      
      // Quality mapping - after pivot, quality data has direct column names
      else if (measurement === 'message_quality' && row.quality_ratio !== undefined) {
        equipment.quality = this.parseNumericValue(row.quality_ratio)?.toString();
        console.log(`Set quality for ${equipmentId}: ${equipment.quality}`);
      }
      
      // Store additional raw data for debugging (store the whole row)
      // DISABLED: This was overwriting the temperature/speed/pressure values
      // if (!equipment[measurement]) {
      //   equipment[measurement] = {};
      // }
      // equipment[measurement] = { ...row };
      
      // Final debug log for this equipment
      console.log(`📊 Final equipment data for ${equipmentId}:`, {
        temperature: equipment.temperature,
        speed: equipment.speed,
        pressure: equipment.pressure,
        measurement: measurement
      });
    }

    return Array.from(equipmentMap.values());
  }

  private parseNumericValue(value: any): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private parseBooleanValue(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    return false;
  }

  private parseStatusValue(value: any): 'running' | 'stopped' | 'error' {
    if (typeof value === 'string') {
      const status = value.toLowerCase();
      if (status === 'running' || status === 'active' || status === 'on') return 'running';
      if (status === 'stopped' || status === 'inactive' || status === 'off') return 'stopped';
      if (status === 'error' || status === 'fault' || status === 'failed') return 'error';
    }
    return 'stopped';
  }

  transformToEquipmentInterface(data: EquipmentData[], equipmentConfig: Equipment[]): Equipment[] {
    return equipmentConfig.map(config => {
      const liveData = data.find(d => d.equipmentId === config.id);
      
      if (!liveData) {
        console.warn(`No live data found for equipment ${config.id} (${config.name})`);
        return {
          ...config,
          status: 'error' // Mark as error when no data is available
        };
      }

      // Determine data freshness
      const dataAge = Date.now() - liveData.timestamp.getTime();
      const isFresh = dataAge < 300000; // 5 minutes
      
      if (!isFresh) {
        console.warn(`Stale data for equipment ${config.id}: ${dataAge}ms old`);
      }

      const mappedStatus = this.mapStatusFromData(liveData, config.type);
      
      // Enhanced equipment mapping with validation
      const validatedTemp = this.validateAndMapTemperature(liveData.temperature, config.type);
      const validatedSpeed = this.validateAndMapSpeed(liveData.speed, config.type);
      const validatedPressure = this.validateAndMapPressure(liveData.pressure, config.type);
      
      console.log(`🔄 Transform ${config.id}: liveTemp=${liveData.temperature} -> validatedTemp=${validatedTemp}, type=${config.type}`);
      
      const updatedEquipment: Equipment = {
        ...config,
        status: mappedStatus,
        temperature: validatedTemp,
        speed: validatedSpeed,
        pressure: validatedPressure
      };

      // Log equipment update for debugging
      console.debug(`Updated equipment ${config.id}:`, {
        status: mappedStatus,
        temperature: updatedEquipment.temperature,
        speed: updatedEquipment.speed,
        pressure: updatedEquipment.pressure,
        dataAge: `${Math.round(dataAge / 1000)}s`
      });

      return updatedEquipment;
    });
  }

  private validateAndMapTemperature(value: number | undefined, equipmentType: string): number | undefined {
    if (value === undefined) return undefined;
    
    // Validate temperature ranges based on equipment type
    switch (equipmentType) {
      case 'oven':
      case 'oven-conveyor':
        return (value >= 0 && value <= 1000) ? value : undefined;
      default:
        return (value >= -50 && value <= 500) ? value : undefined; // Increased range for other equipment
    }
  }

  private validateAndMapSpeed(value: number | undefined, equipmentType: string): number | undefined {
    if (value === undefined) return undefined;
    
    // Validate speed ranges based on equipment type
    switch (equipmentType) {
      case 'conveyor':
        return (value >= 0 && value <= 1000) ? value : undefined;
      default:
        return (value >= 0 && value <= 10000) ? value : undefined;
    }
  }

  private validateAndMapPressure(value: number | undefined, equipmentType: string): number | undefined {
    if (value === undefined) return undefined;
    
    // Validate pressure ranges based on equipment type
    switch (equipmentType) {
      case 'press':
        return (value >= 0 && value <= 5000) ? value : undefined;
      default:
        return (value >= 0 && value <= 1000) ? value : undefined;
    }
  }

  private mapStatusFromData(data: EquipmentData, equipmentType: string): 'running' | 'stopped' | 'error' {
    // Determine status based on equipment type and available data
    const timeDiff = Date.now() - data.timestamp.getTime();
    
    // If data is too old, equipment is likely in error state
    if (timeDiff > 120000) { // 2 minutes
      return 'error';
    }

    // Check equipment-specific status indicators
    if (data.status) {
      return data.status as 'running' | 'stopped' | 'error';
    }

    // Infer status from operational parameters
    switch (equipmentType) {
      case 'oven':
        return (data.temperature && data.temperature > 100) ? 'running' : 'stopped';
      case 'conveyor':
        return (data.speed && data.speed > 0) ? 'running' : 'stopped';
      case 'press':
        return (data.pressure && data.pressure > 50) ? 'running' : 'stopped';
      default:
        return 'running';
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const query = 'buckets() |> limit(n: 1)';
      await this.queryApi.collectRows(query);
      return true;
    } catch (error) {
      return false;
    }
  }

  private getCachedResult(key: string): any {
    const cached = this.connectionCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCachedResult(key: string, data: any): void {
    this.connectionCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache(): void {
    this.connectionCache.clear();
    console.log('InfluxDB cache cleared');
  }

  forceClearCache(): void {
    this.clearCache();
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  getConnectionInfo(): {
    connected: boolean;
    url: string;
    org: string;
    bucket: string;
    cacheSize: number;
  } {
    return {
      connected: this.isConnected,
      url: this.config.url,
      org: this.config.org,
      bucket: this.config.bucket,
      cacheSize: this.connectionCache.size
    };
  }

  getConnectionDiagnostics(): ConnectionDiagnostics {
    return { ...this.diagnostics };
  }

  async validateDataStructure(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      // Test for expected measurements and fields
      const query = `from(bucket: "${this.config.bucket}") |> range(start: -1h) |> group(columns: ["_measurement", "_field"]) |> distinct(column: "_measurement") |> limit(n: 10)`;
      
      const result = await this.queryApi.collectRows(query);
      
      // Check if we have expected measurements
      const measurements = result.map((row: any) => row._value);
      const expectedMeasurements = ['temperature', 'conveyor_speed', 'hydraulic_pressure', 'heating_status', 'motor_status', 'message_quality'];
      
      const hasExpectedData = expectedMeasurements.some(expected => 
        measurements.some(measurement => measurement.includes(expected))
      );
      
      console.log('Data structure validation:', {
        availableMeasurements: measurements,
        hasExpectedData
      });
      
      return hasExpectedData;
    } catch (error) {
      console.warn('Data structure validation failed:', error);
      return false;
    }
  }
}