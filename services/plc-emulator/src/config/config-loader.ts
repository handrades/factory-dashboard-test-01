import { readFileSync, watchFile, unwatchFile } from 'fs';
import { resolve } from 'path';
import { EventEmitter } from 'events';
import { EquipmentConfig } from '@factory-dashboard/shared-types';
import { ConfigValidator } from './config-validator';
import { createLogger } from 'winston';

export interface ConfigLoaderOptions {
  configPath: string;
  watchForChanges?: boolean;
  reloadInterval?: number;
}

export class ConfigLoader extends EventEmitter {
  private configPath: string;
  private watchForChanges: boolean;
  private reloadInterval: number;
  private validator: ConfigValidator;
  private logger: ReturnType<typeof createLogger>;
  private currentConfig: EquipmentConfig[] = [];
  private watchedFiles: Set<string> = new Set();

  constructor(options: ConfigLoaderOptions) {
    super();
    this.configPath = resolve(options.configPath);
    this.watchForChanges = options.watchForChanges ?? true;
    this.reloadInterval = options.reloadInterval ?? 1000;
    this.validator = new ConfigValidator();
    this.logger = createLogger({
      level: 'info',
      format: require('winston').format.json(),
      transports: [
        new (require('winston').transports.Console)()
      ]
    });
  }

  async loadConfiguration(): Promise<EquipmentConfig[]> {
    try {
      const configData = readFileSync(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData);
      
      // Support both single equipment config and array of configs
      const equipmentConfigs = Array.isArray(parsedConfig) ? parsedConfig : [parsedConfig];
      
      const validatedConfigs: EquipmentConfig[] = [];
      
      for (const config of equipmentConfigs) {
        const validation = this.validator.validateEquipment(config);
        
        if (!validation.isValid) {
          const errorMessage = `Configuration validation failed for equipment "${config.id || 'unknown'}":\n${validation.errors.join('\n')}`;
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
        
        validatedConfigs.push(config);
      }
      
      this.currentConfig = validatedConfigs;
      this.logger.info(`Successfully loaded ${validatedConfigs.length} equipment configurations`);
      
      if (this.watchForChanges) {
        this.setupFileWatcher();
      }
      
      return validatedConfigs;
    } catch (error) {
      this.logger.error(`Failed to load configuration: ${error}`);
      throw error;
    }
  }

  private setupFileWatcher(): void {
    if (this.watchedFiles.has(this.configPath)) {
      return;
    }

    watchFile(this.configPath, { interval: this.reloadInterval }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        this.logger.info(`Configuration file changed, reloading...`);
        this.reloadConfiguration();
      }
    });

    this.watchedFiles.add(this.configPath);
    this.logger.info(`Watching configuration file: ${this.configPath}`);
  }

  private async reloadConfiguration(): Promise<void> {
    try {
      const newConfig = await this.loadConfiguration();
      this.emit('configReloaded', newConfig);
      this.logger.info('Configuration reloaded successfully');
    } catch (error) {
      this.emit('configError', error);
      this.logger.error(`Failed to reload configuration: ${error}`);
    }
  }

  getCurrentConfiguration(): EquipmentConfig[] {
    return [...this.currentConfig];
  }

  getEquipmentById(id: string): EquipmentConfig | undefined {
    return this.currentConfig.find(config => config.id === id);
  }

  stopWatching(): void {
    for (const filePath of this.watchedFiles) {
      unwatchFile(filePath);
    }
    this.watchedFiles.clear();
    this.logger.info('Stopped watching configuration files');
  }
}