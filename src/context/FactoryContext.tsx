import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadProductionLines } from '../utils/configLoader';

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

  const getLine = (id: number) => lines.find(line => line.id === id);

  const updateLineStatus = (id: number, status: 'running' | 'stopped' | 'error') => {
    setLines(prevLines => 
      prevLines.map(line => 
        line.id === id ? { ...line, status } : line
      )
    );
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setLines(prevLines => 
        prevLines.map(line => ({
          ...line,
          efficiency: line.status === 'running' ? 
            Math.round(Math.max(0, Math.min(100, line.efficiency + (Math.random() - 0.5) * 10)) * 100) / 100 : 0,
          equipment: line.equipment.map(eq => ({
            ...eq,
            temperature: (eq.type === 'oven' || eq.type === 'oven-conveyor') && eq.status === 'running' ? 
              Math.max(300, Math.min(400, (eq.temperature || 350) + (Math.random() - 0.5) * 20)) : eq.temperature,
            speed: (eq.type === 'conveyor' || eq.type === 'oven-conveyor') && eq.status === 'running' ?
              Math.max(1, Math.min(5, (eq.speed || 2.5) + (Math.random() - 0.5) * 0.5)) : eq.speed,
            pressure: eq.type === 'press' && eq.status === 'running' ?
              Math.max(100, Math.min(200, (eq.pressure || 150) + (Math.random() - 0.5) * 30)) : eq.pressure
          }))
        }))
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <FactoryContext.Provider value={{ lines, getLine, updateLineStatus }}>
      {children}
    </FactoryContext.Provider>
  );
};