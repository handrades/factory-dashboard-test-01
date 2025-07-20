import type { Equipment } from '../context/FactoryContext';

export class FallbackDataService {
  private simulationInterval?: number;
  private simulatedData: Map<string, unknown> = new Map();

  constructor() {
    this.initializeSimulatedData();
  }

  private initializeSimulatedData(): void {
    // Initialize with base values for simulation
    this.simulatedData.set('temperature_base', 350);
    this.simulatedData.set('speed_base', 2.5);
    this.simulatedData.set('pressure_base', 150);
    this.simulatedData.set('last_update', Date.now());
  }

  startSimulation(): void {
    if (this.simulationInterval) {
      return; // Already running
    }

    this.simulationInterval = window.setInterval(() => {
      this.updateSimulatedData();
    }, 2000);
  }

  stopSimulation(): void {
    if (this.simulationInterval) {
      window.clearInterval(this.simulationInterval);
      this.simulationInterval = undefined;
    }
  }

  private updateSimulatedData(): void {
    const now = Date.now();
    const elapsed = (now - this.simulatedData.get('last_update')) / 1000;
    
    // Update temperature with sinusoidal pattern
    const tempBase = this.simulatedData.get('temperature_base');
    const tempVariation = 15 * Math.sin(elapsed * 0.1);
    this.simulatedData.set('current_temperature', tempBase + tempVariation);
    
    // Update speed with random variation
    const speedBase = this.simulatedData.get('speed_base');
    const speedVariation = 0.3 * (Math.random() - 0.5);
    this.simulatedData.set('current_speed', Math.max(0, speedBase + speedVariation));
    
    // Update pressure with linear trend
    const pressureBase = this.simulatedData.get('pressure_base');
    const pressureVariation = 20 * Math.sin(elapsed * 0.05) + 10 * (Math.random() - 0.5);
    this.simulatedData.set('current_pressure', Math.max(0, pressureBase + pressureVariation));
    
    this.simulatedData.set('last_update', now);
  }

  getSimulatedEquipmentData(equipment: Equipment[]): Equipment[] {
    return equipment.map(eq => ({
      ...eq,
      temperature: eq.type === 'oven' || eq.type === 'oven-conveyor' 
        ? this.simulatedData.get('current_temperature') || eq.temperature
        : eq.temperature,
      speed: eq.type === 'conveyor' || eq.type === 'oven-conveyor'
        ? this.simulatedData.get('current_speed') || eq.speed
        : eq.speed,
      pressure: eq.type === 'press'
        ? this.simulatedData.get('current_pressure') || eq.pressure
        : eq.pressure,
      status: this.getSimulatedStatus()
    }));
  }

  private getSimulatedStatus(): 'running' | 'stopped' | 'error' {
    const random = Math.random();
    
    // 90% chance of running, 8% stopped, 2% error
    if (random < 0.9) return 'running';
    if (random < 0.98) return 'stopped';
    return 'error';
  }

  getSimulatedLineEfficiency(): number {
    // Generate efficiency between 75-95%
    const baseEfficiency = 85;
    const variation = 10 * (Math.random() - 0.5);
    return Math.max(75, Math.min(95, baseEfficiency + variation));
  }

  isSimulating(): boolean {
    return this.simulationInterval !== undefined;
  }
}