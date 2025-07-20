import { InfluxDBService } from './influxdb-service';
import { FallbackDataService } from './fallback-data-service';
import { EnvironmentDetectionService } from './environment-detection-service';
import type { FactoryLine, Equipment } from '../context/FactoryContext';

export interface ConnectionStatus {
  source: 'influxdb' | 'simulation';
  connected: boolean;
  lastUpdate: Date;
  error?: string;
  retryCount: number;
}

export interface DataSourceManager {
  currentSource: 'influxdb' | 'simulation';
  switchToInfluxDB(): Promise<boolean>;
  switchToSimulation(): void;
  getCurrentData(lines: FactoryLine[]): Promise<FactoryLine[]>;
  getConnectionStatus(): ConnectionStatus;
  isHealthy(): boolean;
  getDataSourceInfo(): unknown;
}

export class DataSourceManagerImpl implements DataSourceManager {
  private influxDBService: InfluxDBService | null = null;
  private fallbackService: FallbackDataService;
  private environmentService: EnvironmentDetectionService;
  private _currentSource: 'influxdb' | 'simulation' = 'simulation';
  private connectionStatus: ConnectionStatus;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private backgroundRetryInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.environmentService = EnvironmentDetectionService.getInstance();
    this.fallbackService = new FallbackDataService();
    
    this.connectionStatus = {
      source: 'simulation',
      connected: false,
      lastUpdate: new Date(),
      retryCount: 0
    };

    this.initialize();
  }

  get currentSource(): 'influxdb' | 'simulation' {
    return this._currentSource;
  }

  private async initialize(): Promise<void> {
    const envConfig = this.environmentService.detectEnvironment();
    
    if (envConfig.shouldUseInfluxDB && envConfig.influxDBConfig) {
      this.influxDBService = new InfluxDBService(envConfig.influxDBConfig);
      
      // Try initial connection
      const connected = await this.switchToInfluxDB();
      
      if (!connected) {
        console.warn('Initial InfluxDB connection failed, starting with simulation data');
        this.switchToSimulation();
        
        // Start background retry if we should attempt InfluxDB
        this.startBackgroundRetry();
      }
    } else {
      console.log('Environment configured for simulation data only');
      this.switchToSimulation();
    }

    this.startHealthCheck();
  }

  async switchToInfluxDB(): Promise<boolean> {
    if (!this.influxDBService) {
      return false;
    }

    try {
      const connected = await this.influxDBService.connect();
      
      if (connected) {
        // Validate data structure
        const hasValidData = await this.influxDBService.validateDataStructure();
        
        if (hasValidData) {
          this._currentSource = 'influxdb';
          this.connectionStatus = {
            source: 'influxdb',
            connected: true,
            lastUpdate: new Date(),
            retryCount: 0
          };
          
          this.fallbackService.stopSimulation();
          this.stopBackgroundRetry();
          
          console.log('Successfully switched to InfluxDB data source');
          return true;
        } else {
          console.warn('InfluxDB connected but data structure validation failed');
        }
      }
    } catch (error: unknown) {
      console.error('Failed to switch to InfluxDB:', error);
      this.connectionStatus.error = error.message;
    }

    this.connectionStatus.retryCount++;
    return false;
  }

  switchToSimulation(): void {
    this._currentSource = 'simulation';
    this.connectionStatus = {
      source: 'simulation',
      connected: true,
      lastUpdate: new Date(),
      retryCount: 0
    };
    
    this.fallbackService.startSimulation();
    console.log('Switched to simulation data source');
  }

  async getCurrentData(lines: FactoryLine[]): Promise<FactoryLine[]> {
    this.connectionStatus.lastUpdate = new Date();

    console.log('DataSourceManager.getCurrentData called:', {
      currentSource: this._currentSource,
      hasInfluxDBService: !!this.influxDBService,
      linesCount: lines.length,
      connectionStatus: this.connectionStatus
    });

    if (this._currentSource === 'influxdb' && this.influxDBService) {
      try {
        console.log('Attempting to get InfluxDB data...');
        const result = await this.getInfluxDBData(lines);
        console.log('Successfully got InfluxDB data:', {
          linesCount: result.length,
          firstLineEquipmentCount: result[0]?.equipment?.length || 0
        });
        return result;
      } catch (error: unknown) {
        console.error('Error getting InfluxDB data, falling back to simulation:', error);
        
        // Switch to fallback data
        this.switchToSimulation();
        this.startBackgroundRetry();
        
        return this.getSimulationData(lines);
      }
    } else {
      console.log('Using simulation data, currentSource:', this._currentSource);
      return this.getSimulationData(lines);
    }
  }

  private async getInfluxDBData(lines: FactoryLine[]): Promise<FactoryLine[]> {
    if (!this.influxDBService) {
      throw new Error('InfluxDB service not available');
    }

    const equipmentIds = lines.flatMap(line => line.equipment.map(eq => eq.id));
    
    const [equipmentData, statusMap] = await Promise.all([
      this.influxDBService.getLatestEquipmentData(equipmentIds),
      this.influxDBService.getEquipmentStatus(equipmentIds)
    ]);

    const updatedLines = await Promise.all(
      lines.map(async line => {
        const lineEquipmentIds = line.equipment.map(eq => eq.id);
        const lineEquipmentData = equipmentData.filter(data => 
          lineEquipmentIds.includes(data.equipmentId)
        );

        const updatedEquipment = this.influxDBService!.transformToEquipmentInterface(
          lineEquipmentData,
          line.equipment
        );

        // Update equipment status from InfluxDB
        updatedEquipment.forEach(eq => {
          if (statusMap[eq.id]) {
            eq.status = statusMap[eq.id] as 'running' | 'stopped' | 'error';
          }
        });

        // Get line efficiency
        const efficiency = await this.influxDBService!.getLineEfficiency(line.id.toString());

        return {
          ...line,
          equipment: updatedEquipment,
          efficiency: Math.round(efficiency * 100) / 100,
          status: this.determineLineStatus(updatedEquipment)
        };
      })
    );

    this.connectionStatus.connected = true;
    this.connectionStatus.error = undefined;
    
    return updatedLines;
  }

  private getSimulationData(lines: FactoryLine[]): FactoryLine[] {
    return lines.map(line => ({
      ...line,
      equipment: this.fallbackService.getSimulatedEquipmentData(line.equipment),
      efficiency: line.status === 'running' ? 
        this.fallbackService.getSimulatedLineEfficiency() : 0,
      status: this.determineLineStatus(line.equipment)
    }));
  }

  private determineLineStatus(equipment: Equipment[]): 'running' | 'stopped' | 'error' {
    if (equipment.some(eq => eq.status === 'error')) {
      return 'error';
    }
    if (equipment.every(eq => eq.status === 'stopped')) {
      return 'stopped';
    }
    return 'running';
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  isHealthy(): boolean {
    if (this._currentSource === 'simulation') {
      return true;
    }
    
    return this.influxDBService?.isHealthy() ?? false;
  }

  getDataSourceInfo() {
    const envInfo = this.environmentService.getEnvironmentInfo();
    const influxInfo = this.influxDBService?.getConnectionInfo();
    const diagnostics = this.influxDBService?.getConnectionDiagnostics();

    return {
      environment: envInfo,
      currentSource: this._currentSource,
      connectionStatus: this.connectionStatus,
      influxDB: influxInfo,
      diagnostics,
      isSimulationRunning: this._currentSource === 'simulation'
    };
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this._currentSource === 'influxdb' && this.influxDBService) {
        const isHealthy = await this.influxDBService.testConnection();
        
        if (!isHealthy) {
          console.warn('InfluxDB connection lost, switching to fallback data');
          this.switchToSimulation();
          this.startBackgroundRetry();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private startBackgroundRetry(): void {
    if (this.backgroundRetryInterval || !this.influxDBService) {
      return;
    }

    this.backgroundRetryInterval = setInterval(async () => {
      if (this._currentSource === 'simulation') {
        const connected = await this.switchToInfluxDB();
        
        if (connected) {
          console.log('InfluxDB connection restored via background retry');
          this.stopBackgroundRetry();
        }
      }
    }, 60000); // Retry every 60 seconds
  }

  private stopBackgroundRetry(): void {
    if (this.backgroundRetryInterval) {
      clearInterval(this.backgroundRetryInterval);
      this.backgroundRetryInterval = null;
    }
  }

  // Cleanup method
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.stopBackgroundRetry();
    this.fallbackService.stopSimulation();
  }

  // Manual reconnection method
  async forceReconnect(): Promise<boolean> {
    if (!this.influxDBService) {
      return false;
    }

    console.log('Forcing InfluxDB reconnection...');
    this.connectionStatus.retryCount = 0;
    
    // Clear cache to ensure fresh data
    this.influxDBService.forceClearCache();
    
    return await this.switchToInfluxDB();
  }

  // Force cache clearing for fresh data
  forceClearCache(): void {
    if (this.influxDBService) {
      this.influxDBService.forceClearCache();
      console.log('Data source manager: Cache cleared');
    }
  }
}

// Singleton instance for global use
let dataSourceManager: DataSourceManagerImpl | null = null;

export function getDataSourceManager(): DataSourceManagerImpl {
  if (!dataSourceManager) {
    dataSourceManager = new DataSourceManagerImpl();
  }
  return dataSourceManager;
}

export function resetDataSourceManager(): void {
  if (dataSourceManager) {
    dataSourceManager.destroy();
    dataSourceManager = null;
  }
}