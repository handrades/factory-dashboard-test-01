import { InfluxDB, type QueryApi } from '@influxdata/influxdb-client';
import type { Equipment } from '../context/FactoryContext';

export interface InfluxDBServiceConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  timeout: number;
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
  private cacheTimeout: number = 30000; // 30 seconds

  constructor(config: InfluxDBServiceConfig) {
    this.config = config;
    this.client = new InfluxDB({
      url: config.url,
      token: config.token,
      timeout: config.timeout
    });
    this.queryApi = this.client.getQueryApi(config.org);
  }

  async connect(): Promise<boolean> {
    try {
      // Test connection with a simple query
      await this.queryApi.collectRows('buckets() |> limit(n: 1)');
      this.isConnected = true;
      console.log('Successfully connected to InfluxDB');
      return true;
    } catch (error) {
      console.error('Failed to connect to InfluxDB:', error);
      this.isConnected = false;
      return false;
    }
  }

  async getLatestEquipmentData(equipmentIds: string[]): Promise<EquipmentData[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to InfluxDB');
    }

    try {
      const cacheKey = `latest-${equipmentIds.join(',')}`;
      const cached = this.getCachedResult(cacheKey);
      if (cached) return cached;

      const equipmentFilter = equipmentIds.map(id => `r.equipment_id == "${id}"`).join(' or ');
      
      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: -1h)
          |> filter(fn: (r) => ${equipmentFilter})
          |> group(columns: ["equipment_id", "_measurement", "_field"])
          |> last()
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      `;

      const result = await this.queryApi.collectRows(query);
      const equipmentData = this.transformQueryResultToEquipmentData(result);
      
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

      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: -${timeRange})
          |> filter(fn: (r) => r.equipment_id == "${equipmentId}")
          |> filter(fn: (r) => r._measurement == "${measurement}")
          |> filter(fn: (r) => r._field == "${field}")
          |> aggregateWindow(every: ${interval}, fn: mean, createEmpty: false)
          |> yield(name: "mean")
      `;

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

      const equipmentFilter = equipmentIds.map(id => `r.equipment_id == "${id}"`).join(' or ');
      
      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: -10m)
          |> filter(fn: (r) => ${equipmentFilter})
          |> filter(fn: (r) => r._measurement == "message_quality" or r._field == "heartbeat")
          |> group(columns: ["equipment_id"])
          |> last()
      `;

      const result = await this.queryApi.collectRows(query);
      const statusMap: { [equipmentId: string]: string } = {};
      
      for (const equipmentId of equipmentIds) {
        const equipmentRows = result.filter((row: any) => row.equipment_id === equipmentId);
        
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

      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: -${timeRange})
          |> filter(fn: (r) => r.line_id == "${lineId}")
          |> filter(fn: (r) => r._measurement == "message_quality")
          |> filter(fn: (r) => r._field == "quality_ratio")
          |> mean()
      `;

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
    const equipmentMap = new Map<string, EquipmentData>();

    for (const row of result) {
      const equipmentId = row.equipment_id;
      
      if (!equipmentMap.has(equipmentId)) {
        equipmentMap.set(equipmentId, {
          equipmentId,
          timestamp: new Date(row._time)
        });
      }

      const equipment = equipmentMap.get(equipmentId)!;
      
      // Map common fields based on measurement and field names
      if (row._measurement === 'temperature' && row.value !== undefined) {
        equipment.temperature = row.value;
      } else if (row._measurement === 'conveyor_speed' && row.value !== undefined) {
        equipment.speed = row.value;
      } else if (row._measurement === 'hydraulic_pressure' && row.value !== undefined) {
        equipment.pressure = row.value;
      } else if (row._measurement === 'heating_status' && row.enabled !== undefined) {
        equipment.status = row.enabled ? 'running' : 'stopped';
      } else if (row._measurement === 'motor_status' && row.running !== undefined) {
        equipment.status = row.running ? 'running' : 'stopped';
      }
      
      // Store raw field data
      Object.keys(row).forEach(key => {
        if (key.startsWith('_') || key === 'equipment_id') return;
        equipment[key] = row[key];
      });
    }

    return Array.from(equipmentMap.values());
  }

  transformToEquipmentInterface(data: EquipmentData[], equipmentConfig: Equipment[]): Equipment[] {
    return equipmentConfig.map(config => {
      const liveData = data.find(d => d.equipmentId === config.id);
      
      if (!liveData) {
        return config; // Return original config if no live data
      }

      return {
        ...config,
        status: this.mapStatusFromData(liveData, config.type),
        temperature: liveData.temperature ?? config.temperature,
        speed: liveData.speed ?? config.speed,
        pressure: liveData.pressure ?? config.pressure
      };
    });
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
      await this.queryApi.collectRows('buckets() |> limit(n: 1)');
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
}