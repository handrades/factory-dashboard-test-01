import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadProductionLines } from '../utils/configLoader';
import { getDataSourceManager } from '../services/data-source-manager';
import { EnvironmentDetectionService } from '../services/environment-detection-service';

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

interface FactoryContextType {
  lines: FactoryLine[];
  getLine: (id: number) => FactoryLine | undefined;
  updateLineStatus: (id: number, status: 'running' | 'stopped' | 'error') => void;
  isConnectedToInfluxDB: boolean;
  isUsingFallbackData: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  dataSource: 'influxdb' | 'simulation';
  environmentInfo: any;
  lastDataUpdate: Date | null;
  forceReconnect: () => Promise<boolean>;
  forceClearCache: () => void;
  getDataSourceInfo: () => any;
}

const FactoryContext = createContext<FactoryContextType | undefined>(undefined);

export const useFactory = () => {
  const context = useContext(FactoryContext);
  if (!context) {
    throw new Error('useFactory must be used within a FactoryProvider');
  }
  return context;
};

export const FactoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lines, setLines] = useState<FactoryLine[]>(loadProductionLines());
  const [isConnectedToInfluxDB, setIsConnectedToInfluxDB] = useState(false);
  const [isUsingFallbackData, setIsUsingFallbackData] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  const [dataSource, setDataSource] = useState<'influxdb' | 'simulation'>('simulation');
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null);

  // Initialize services
  const [dataSourceManager] = useState(() => getDataSourceManager());
  const [environmentService] = useState(() => EnvironmentDetectionService.getInstance());

  const getLine = (id: number) => lines.find(line => line.id === id);

  const updateLineStatus = (id: number, status: 'running' | 'stopped' | 'error') => {
    setLines(prevLines => 
      prevLines.map(line => 
        line.id === id ? { ...line, status } : line
      )
    );
  };

  const forceReconnect = async (): Promise<boolean> => {
    setConnectionStatus('connecting');
    const success = await dataSourceManager.forceReconnect();
    updateConnectionState();
    return success;
  };

  const forceClearCache = () => {
    dataSourceManager.forceClearCache();
    console.log('Factory context: Cache cleared, forcing immediate data update');
    // Trigger immediate data update after clearing cache
    updateData();
  };

  const getDataSourceInfo = () => {
    return dataSourceManager.getDataSourceInfo();
  };

  const updateConnectionState = () => {
    const connStatus = dataSourceManager.getConnectionStatus();
    const currentSource = dataSourceManager.currentSource;
    
    setDataSource(currentSource);
    setIsConnectedToInfluxDB(currentSource === 'influxdb' && connStatus.connected);
    setIsUsingFallbackData(currentSource === 'simulation');
    
    if (currentSource === 'influxdb') {
      setConnectionStatus(connStatus.connected ? 'connected' : 'error');
    } else {
      setConnectionStatus('disconnected');
    }
  };

  const updateData = async () => {
    try {
      const updatedLines = await dataSourceManager.getCurrentData(lines);
      setLines(updatedLines);
      setLastDataUpdate(new Date());
      
      // Update connection state after successful data fetch
      updateConnectionState();
    } catch (error) {
      console.error('Error updating factory data:', error);
      updateConnectionState();
    }
  };

  // Initialize environment and data source
  useEffect(() => {
    const envConfig = environmentService.detectEnvironment();
    
    // Log environment information
    console.log('Factory dashboard initialized:', {
      environment: envConfig.deploymentEnvironment,
      dataSource: envConfig.dataSource,
      shouldUseInfluxDB: envConfig.shouldUseInfluxDB
    });

    // Don't show connection errors in GitHub Pages mode
    if (!environmentService.shouldShowConnectionErrors()) {
      console.log('GitHub Pages mode detected - connection errors will be suppressed');
    }

    // Update initial state
    updateConnectionState();
  }, []);

  // Data update loop
  useEffect(() => {
    updateData(); // Initial update
    const interval = setInterval(updateData, 2000); // Update every 2 seconds for more responsive updates

    return () => clearInterval(interval);
  }, [dataSourceManager]);

  return (
    <FactoryContext.Provider value={{ 
      lines, 
      getLine, 
      updateLineStatus,
      isConnectedToInfluxDB,
      isUsingFallbackData,
      connectionStatus,
      dataSource,
      environmentInfo: environmentService.getEnvironmentInfo(),
      lastDataUpdate,
      forceReconnect,
      forceClearCache,
      getDataSourceInfo
    }}>
      {children}
    </FactoryContext.Provider>
  );
};