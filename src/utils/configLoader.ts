import type { FactoryLine, Equipment } from '../context';

interface ConfigEquipment {
  id: string;
  name: string;
  type: string;
  status: string;
  temperature?: number;
  speed?: number;
  pressure?: number;
}

interface ConfigLine {
  id: number;
  name: string;
  status: string;
  efficiency: number;
  equipment: ConfigEquipment[];
}

export const loadProductionLines = (): FactoryLine[] => {
  const configModules = import.meta.glob('../../infrastructure/config/*.json', { eager: true, import: 'default' });
  
  const configurations: ConfigLine[] = Object.values(configModules) as ConfigLine[];
  
  configurations.sort((a, b) => a.id - b.id);

  return configurations.map(config => ({
    id: config.id,
    name: config.name,
    status: config.status as 'running' | 'stopped' | 'error',
    efficiency: config.efficiency,
    equipment: config.equipment.map(eq => ({
      id: eq.id,
      name: eq.name,
      type: eq.type as 'oven' | 'conveyor' | 'press' | 'assembly' | 'oven-conveyor',
      status: eq.status as 'running' | 'stopped' | 'error',
      temperature: eq.temperature,
      speed: eq.speed,
      pressure: eq.pressure
    } satisfies Equipment))
  }));
};