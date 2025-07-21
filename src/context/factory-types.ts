export interface EnvironmentInfo {
  environment: 'github-pages' | 'docker' | 'development';
  dataSource: 'influxdb' | 'simulation';
  shouldUseInfluxDB: boolean;
  isProduction: boolean;
  showConnectionErrors: boolean;
  influxDBUrl?: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'oven' | 'conveyor' | 'press' | 'assembly' | 'oven-conveyor';
  status: 'running' | 'stopped' | 'error';
  temperature?: number;
  speed?: number;
  pressure?: number;
}

export interface FactoryLine {
  id: number;
  name: string;
  status: 'running' | 'stopped' | 'error';
  equipment: Equipment[];
  efficiency: number;
}

export interface FactoryContextType {
  lines: FactoryLine[];
  getLine: (id: number) => FactoryLine | undefined;
  updateLineStatus: (id: number, status: 'running' | 'stopped' | 'error') => void;
  isConnectedToInfluxDB: boolean;
  isUsingFallbackData: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  dataSource: 'influxdb' | 'simulation';
  environmentInfo: EnvironmentInfo;
  lastDataUpdate: Date | null;
  forceReconnect: () => Promise<boolean>;
  forceClearCache: () => void;
  getDataSourceInfo: () => unknown;
}