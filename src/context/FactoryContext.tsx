import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Equipment {
  id: string;
  name: string;
  type: 'oven' | 'conveyor' | 'press' | 'assembly';
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
  const [lines, setLines] = useState<FactoryLine[]>([
    {
      id: 1,
      name: 'Production Line 1',
      status: 'running',
      efficiency: 85.75,
      equipment: [
        { id: 'oven1', name: 'Industrial Oven', type: 'oven', status: 'running', temperature: 350 },
        { id: 'conveyor1', name: 'Conveyor Belt', type: 'conveyor', status: 'running', speed: 2.5 },
        { id: 'press1', name: 'Hydraulic Press', type: 'press', status: 'running', pressure: 150 },
        { id: 'assembly1', name: 'Assembly Table', type: 'assembly', status: 'running' }
      ]
    },
    {
      id: 2,
      name: 'Production Line 2',
      status: 'running',
      efficiency: 92.33,
      equipment: [
        { id: 'oven2', name: 'Industrial Oven', type: 'oven', status: 'running', temperature: 325 },
        { id: 'conveyor2', name: 'Conveyor Belt', type: 'conveyor', status: 'running', speed: 3.0 },
        { id: 'press2', name: 'Hydraulic Press', type: 'press', status: 'running', pressure: 180 },
        { id: 'assembly2', name: 'Assembly Table', type: 'assembly', status: 'running' }
      ]
    },
    {
      id: 3,
      name: 'Production Line 3',
      status: 'stopped',
      efficiency: 0,
      equipment: [
        { id: 'oven3', name: 'Industrial Oven', type: 'oven', status: 'stopped', temperature: 25 },
        { id: 'conveyor3', name: 'Conveyor Belt', type: 'conveyor', status: 'stopped', speed: 0 },
        { id: 'press3', name: 'Hydraulic Press', type: 'press', status: 'stopped', pressure: 0 },
        { id: 'assembly3', name: 'Assembly Table', type: 'assembly', status: 'stopped' }
      ]
    },
    {
      id: 4,
      name: 'Production Line 4',
      status: 'running',
      efficiency: 78.92,
      equipment: [
        { id: 'oven4', name: 'Industrial Oven', type: 'oven', status: 'running', temperature: 375 },
        { id: 'conveyor4', name: 'Conveyor Belt', type: 'conveyor', status: 'running', speed: 2.0 },
        { id: 'press4', name: 'Hydraulic Press', type: 'press', status: 'error', pressure: 0 },
        { id: 'assembly4', name: 'Assembly Table', type: 'assembly', status: 'running' }
      ]
    },
    {
      id: 5,
      name: 'Production Line 5',
      status: 'running',
      efficiency: 95.18,
      equipment: [
        { id: 'oven5', name: 'Industrial Oven', type: 'oven', status: 'running', temperature: 340 },
        { id: 'conveyor5', name: 'Conveyor Belt', type: 'conveyor', status: 'running', speed: 3.2 },
        { id: 'press5', name: 'Hydraulic Press', type: 'press', status: 'running', pressure: 165 },
        { id: 'assembly5', name: 'Assembly Table', type: 'assembly', status: 'running' }
      ]
    }
  ]);

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
            temperature: eq.type === 'oven' && eq.status === 'running' ? 
              Math.max(300, Math.min(400, (eq.temperature || 350) + (Math.random() - 0.5) * 20)) : eq.temperature,
            speed: eq.type === 'conveyor' && eq.status === 'running' ?
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