import React, { useState, useEffect, useCallback } from 'react';
import { loadProductionLines } from '../utils/configLoader';
import { getDataSourceManager } from '../services/data-source-manager';
import { EnvironmentDetectionService } from '../services/environment-detection-service';
import type { FactoryLine } from './factory-types';
import { FactoryContext } from './factory-context';

const FactoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  const updateConnectionState = useCallback(() => {
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
  }, [dataSourceManager]);

  const updateData = useCallback(async () => {
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
  }, [lines, updateConnectionState, dataSourceManager]);

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
  }, [environmentService, updateConnectionState]);

  // Data update loop
  useEffect(() => {
    updateData(); // Initial update
    const interval = setInterval(updateData, 2000); // Update every 2 seconds for more responsive updates

    return () => clearInterval(interval);
  }, [updateData]);

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

export { FactoryProvider };