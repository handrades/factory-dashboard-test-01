import { readFileSync, readdirSync, watchFile, unwatchFile } from 'fs';
import { resolve, join } from 'path';
import { EventEmitter } from 'events';
import { EquipmentConfig, LineConfig } from '@factory-dashboard/shared-types';
import { createLogger } from 'winston';
import * as winston from 'winston';

export interface LineConfigLoaderOptions {
  configDirectory: string;
  watchForChanges?: boolean;
  reloadInterval?: number;
}

export class LineConfigLoader extends EventEmitter {
  private configDirectory: string;
  private watchForChanges: boolean;
  private reloadInterval: number;
  private logger: ReturnType<typeof createLogger>;
  private currentConfigs: EquipmentConfig[] = [];
  private watchedFiles: Set<string> = new Set();

  constructor(options: LineConfigLoaderOptions) {
    super();
    this.configDirectory = resolve(options.configDirectory);
    this.watchForChanges = options.watchForChanges ?? true;
    this.reloadInterval = options.reloadInterval ?? 1000;
    this.logger = createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console()
      ]
    });
  }

  async loadConfiguration(): Promise<EquipmentConfig[]> {
    try {
      const lineFiles = this.getLineConfigFiles();
      const allEquipmentConfigs: EquipmentConfig[] = [];

      for (const lineFile of lineFiles) {
        const lineConfig = this.loadLineConfig(lineFile);
        const equipmentConfigs = this.convertLineToEquipmentConfigs(lineConfig);
        allEquipmentConfigs.push(...equipmentConfigs);
      }

      this.currentConfigs = allEquipmentConfigs;
      this.logger.info(`Successfully loaded ${allEquipmentConfigs.length} equipment configurations from ${lineFiles.length} lines`);

      if (this.watchForChanges) {
        this.setupFileWatchers(lineFiles);
      }

      return allEquipmentConfigs;
    } catch (error) {
      this.logger.error(`Failed to load line configurations: ${error}`);
      throw error;
    }
  }

  private getLineConfigFiles(): string[] {
    try {
      const files = readdirSync(this.configDirectory);
      const lineFiles = files
        .filter(file => file.startsWith('line') && file.endsWith('.json'))
        .map(file => join(this.configDirectory, file));
      
      this.logger.info(`Found ${lineFiles.length} line configuration files`);
      return lineFiles;
    } catch (error) {
      this.logger.error(`Failed to read config directory: ${error}`);
      throw error;
    }
  }

  private loadLineConfig(filePath: string): LineConfig {
    try {
      const configData = readFileSync(filePath, 'utf-8');
      const lineConfig: LineConfig = JSON.parse(configData);
      
      this.logger.debug(`Loaded line config: ${lineConfig.name} (Line ${lineConfig.line})`);
      return lineConfig;
    } catch (error) {
      this.logger.error(`Failed to load line config from ${filePath}: ${error}`);
      throw error;
    }
  }

  private convertLineToEquipmentConfigs(lineConfig: LineConfig): EquipmentConfig[] {
    const equipmentConfigs: EquipmentConfig[] = [];

    for (const equipment of lineConfig.equipment) {
      // Convert each equipment in the line to an EquipmentConfig
      const equipmentConfig: EquipmentConfig = {
        id: equipment.id,
        name: equipment.name,
        type: equipment.type as "oven" | "conveyor" | "press" | "assembly" | "oven-conveyor",
        lineId: `line${lineConfig.line}`,
        site: lineConfig.site,
        productType: lineConfig.type,
        lineNumber: lineConfig.line,
        tags: equipment.tags.map(tag => ({
          id: tag.id,
          name: tag.name,
          equipmentId: equipment.id,
          dataType: tag.dataType,
          address: `DB${lineConfig.line}.${tag.id}`,
          value: tag.value,
          timestamp: new Date(),
          quality: 'GOOD' as const,
          behavior: tag.behavior
        })),
        states: this.generateDefaultStates(equipment.type),
        currentState: equipment.status
      };

      equipmentConfigs.push(equipmentConfig);
    }

    return equipmentConfigs;
  }

  private generateDefaultStates(equipmentType: string /*, _currentStatus: string */) {
    // Generate default states based on equipment type
    const baseStates = [
      {
        name: 'running',
        description: `${equipmentType} is running normally`,
        tagOverrides: [],
        transitions: [
          { toState: 'stopped', condition: 'manual_stop' },
          { toState: 'fault', condition: 'equipment_fault', probability: 0.01 }
        ]
      },
      {
        name: 'stopped',
        description: `${equipmentType} is stopped`,
        tagOverrides: [],
        transitions: [
          { toState: 'running', condition: 'manual_start' }
        ]
      },
      {
        name: 'fault',
        description: `${equipmentType} has a fault condition`,
        tagOverrides: [],
        transitions: [
          { toState: 'stopped', condition: 'fault_reset' }
        ]
      }
    ];

    return baseStates;
  }

  private setupFileWatchers(lineFiles: string[]): void {
    // Clear existing watchers
    this.clearFileWatchers();

    for (const lineFile of lineFiles) {
      watchFile(lineFile, { interval: this.reloadInterval }, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          this.logger.info(`Line configuration file changed: ${lineFile}, reloading...`);
          this.reloadConfiguration();
        }
      });

      this.watchedFiles.add(lineFile);
    }

    this.logger.info(`Watching ${lineFiles.length} line configuration files`);
  }

  private clearFileWatchers(): void {
    for (const filePath of this.watchedFiles) {
      unwatchFile(filePath);
    }
    this.watchedFiles.clear();
  }

  private async reloadConfiguration(): Promise<void> {
    try {
      const newConfigs = await this.loadConfiguration();
      this.emit('configReloaded', newConfigs);
      this.logger.info('Line configurations reloaded successfully');
    } catch (error) {
      this.emit('configError', error);
      this.logger.error(`Failed to reload line configurations: ${error}`);
    }
  }

  stopWatching(): void {
    this.clearFileWatchers();
    this.logger.info('Stopped watching line configuration files');
  }

  getCurrentConfigs(): EquipmentConfig[] {
    return [...this.currentConfigs];
  }
}