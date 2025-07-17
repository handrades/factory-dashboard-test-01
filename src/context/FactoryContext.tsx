import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadProductionLines } from '../utils/configLoader';
import { InfluxDBService } from '../services/influxdb-service';
import { FallbackDataService } from '../services/fallback-data-service';

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

  // Initialize services
  const [influxDBService] = useState(() => new InfluxDBService({
    url: import.meta.env.VITE_INFLUXDB_URL || 'http://localhost:8086',
    token: import.meta.env.VITE_INFLUXDB_TOKEN || 'your-token-here',
    org: import.meta.env.VITE_INFLUXDB_ORG || 'factory-dashboard',
    bucket: import.meta.env.VITE_INFLUXDB_BUCKET || 'factory-data',
    timeout: 10000
  }));

  const [fallbackService] = useState(() => new FallbackDataService());

  const getLine = (id: number) => lines.find(line => line.id === id);

  const updateLineStatus = (id: number, status: 'running' | 'stopped' | 'error') => {
    setLines(prevLines => 
      prevLines.map(line => 
        line.id === id ? { ...line, status } : line
      )
    );
  };

  // Initialize InfluxDB connection
  useEffect(() => {
    const initializeConnection = async () => {
      setConnectionStatus('connecting');
      
      try {
        const connected = await influxDBService.connect();
        setIsConnectedToInfluxDB(connected);
        setIsUsingFallbackData(!connected);
        setConnectionStatus(connected ? 'connected' : 'error');
        
        if (!connected) {
          console.warn('Failed to connect to InfluxDB, using fallback data simulation');
          fallbackService.startSimulation();
        } else {
          console.log('Successfully connected to InfluxDB for real-time data');
          fallbackService.stopSimulation();
        }
      } catch (error) {
        console.error('Error initializing InfluxDB connection:', error);
        setIsConnectedToInfluxDB(false);
        setIsUsingFallbackData(true);
        setConnectionStatus('error');
        fallbackService.startSimulation();
      }
    };

    initializeConnection();

    // Check connection health periodically
    const healthCheck = setInterval(async () => {
      if (isConnectedToInfluxDB) {
        const isHealthy = await influxDBService.testConnection();
        if (!isHealthy) {
          console.warn('InfluxDB connection lost, switching to fallback data');
          setIsConnectedToInfluxDB(false);
          setIsUsingFallbackData(true);
          setConnectionStatus('error');
          fallbackService.startSimulation();
        }
      } else {
        // Try to reconnect
        const connected = await influxDBService.connect();
        if (connected) {
          console.log('InfluxDB connection restored');
          setIsConnectedToInfluxDB(true);
          setIsUsingFallbackData(false);
          setConnectionStatus('connected');
          fallbackService.stopSimulation();
        }
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(healthCheck);
      fallbackService.stopSimulation();
    };
  }, [influxDBService, fallbackService, isConnectedToInfluxDB]);

  // Data update loop
  useEffect(() => {
    const updateData = async () => {
      try {
        if (isConnectedToInfluxDB) {
          // Get real data from InfluxDB
          const equipmentIds = lines.flatMap(line => line.equipment.map(eq => eq.id));
          
          const [equipmentData, statusMap] = await Promise.all([
            influxDBService.getLatestEquipmentData(equipmentIds),
            influxDBService.getEquipmentStatus(equipmentIds)
          ]);

          const updatedLines = await Promise.all(
            lines.map(async line => {
              const lineEquipmentIds = line.equipment.map(eq => eq.id);
              const lineEquipmentData = equipmentData.filter(data => 
                lineEquipmentIds.includes(data.equipmentId)
              );

              const updatedEquipment = influxDBService.transformToEquipmentInterface(
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
              const efficiency = await influxDBService.getLineEfficiency(line.id.toString());

              return {
                ...line,
                equipment: updatedEquipment,
                efficiency: Math.round(efficiency * 100) / 100,
                status: (updatedEquipment.some(eq => eq.status === 'error') ? 'error' :
                        updatedEquipment.every(eq => eq.status === 'stopped') ? 'stopped' : 'running') as 'running' | 'stopped' | 'error'
              };
            })
          );
          
          setLines(updatedLines);

        } else {
          // Use fallback simulation data
          setLines(prevLines => 
            prevLines.map(line => ({
              ...line,
              equipment: fallbackService.getSimulatedEquipmentData(line.equipment),
              efficiency: line.status === 'running' ? 
                fallbackService.getSimulatedLineEfficiency() : 0,
              status: line.equipment.some(eq => eq.status === 'error') ? 'error' :
                      line.equipment.every(eq => eq.status === 'stopped') ? 'stopped' : 'running'
            }))
          );
        }
      } catch (error) {
        console.error('Error updating factory data:', error);
        // Switch to fallback data on error
        if (isConnectedToInfluxDB) {
          setIsConnectedToInfluxDB(false);
          setIsUsingFallbackData(true);
          setConnectionStatus('error');
          fallbackService.startSimulation();
        }
      }
    };

    updateData(); // Initial update
    const interval = setInterval(updateData, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [isConnectedToInfluxDB, influxDBService, fallbackService]);

  return (
    <FactoryContext.Provider value={{ 
      lines, 
      getLine, 
      updateLineStatus,
      isConnectedToInfluxDB,
      isUsingFallbackData,
      connectionStatus
    }}>
      {children}
    </FactoryContext.Provider>
  );
};