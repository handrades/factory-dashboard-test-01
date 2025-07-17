export * from './plc-types';
export * from './queue-types';
export * from './influxdb-types';
export * from './metrics';

// Simple logger exports to replace the complex logging module
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export class FactoryLogger implements Logger {
  constructor(private service: string) {}

  debug(message: string, ...args: any[]): void {
    console.log(`[DEBUG] ${this.service}: ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${this.service}: ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.log(`[WARN] ${this.service}: ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.log(`[ERROR] ${this.service}: ${message}`, ...args);
  }

  // Add missing methods that are expected
  createTimer(name: string, context?: any): any {
    return {
      done: () => console.log(`[TIMER] ${this.service}: ${name} completed`)
    };
  }
}

export const createFactoryLogger = (service: string): FactoryLogger => {
  return new FactoryLogger(service);
};