import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';
import { EquipmentConfig } from '@factory-dashboard/shared-types';
import { ConfigValidator } from './config-validator';
import { createFactoryLogger } from '@factory-dashboard/shared-types';

export interface ConfigTemplate {
  id: string;
  name: string;
  type: string;
  template: unknown;
  requiredVariables: string[];
  defaultValues: Record<string, unknown>;
}

export interface ConfigGenerationParams {
  equipmentId: string;
  equipmentName: string;
  lineId: string;
  equipmentType: 'oven' | 'conveyor' | 'press' | 'assembly' | 'oven-conveyor';
  customParams?: Record<string, unknown>;
}

export interface EnvironmentConfig {
  development: {
    redis: {
      host: string;
      port: number;
      password?: string;
    };
    influxdb: {
      url: string;
      token: string;
      org: string;
      bucket: string;
    };
    updateInterval: number;
    logLevel: string;
  };
  staging: {
    redis: {
      host: string;
      port: number;
      password?: string;
    };
    influxdb: {
      url: string;
      token: string;
      org: string;
      bucket: string;
    };
    updateInterval: number;
    logLevel: string;
  };
  production: {
    redis: {
      host: string;
      port: number;
      password?: string;
    };
    influxdb: {
      url: string;
      token: string;
      org: string;
      bucket: string;
    };
    updateInterval: number;
    logLevel: string;
  };
}

export class ConfigManager {
  private validator: ConfigValidator;
  private logger: ReturnType<typeof createFactoryLogger>;
  private templates: Map<string, ConfigTemplate> = new Map();
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.validator = new ConfigValidator();
    this.logger = createFactoryLogger('config-manager');
    this.loadTemplates();
  }

  private loadTemplates(): void {
    const templateTypes = ['oven', 'conveyor', 'press', 'assembly', 'oven-conveyor'];
    
    for (const type of templateTypes) {
      try {
        const templatePath = resolve(this.basePath, 'templates', `${type}-template.json`);
        if (existsSync(templatePath)) {
          const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
          this.templates.set(type, {
            id: type,
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} Template`,
            type,
            template,
            requiredVariables: this.extractVariables(template),
            defaultValues: this.getDefaultValues(type)
          });
        }
      } catch {
        this.logger.error(`Failed to load template for ${type}`, error as Error);
      }
    }
    
    this.logger.info(`Loaded ${this.templates.size} configuration templates`);
  }

  private extractVariables(template: unknown): string[] {
    const variables: Set<string> = new Set();
    const templateStr = JSON.stringify(template);
    const matches = templateStr.match(/\{\{([^}]+)\}\}/g);
    
    if (matches) {
      matches.forEach(match => {
        const variable = match.replace(/\{\{|\}\}/g, '');
        variables.add(variable);
      });
    }
    
    return Array.from(variables);
  }

  private getDefaultValues(type: string): Record<string, unknown> {
    const defaults: Record<string, Record<string, unknown>> = {
      oven: {
        DEFAULT_TEMP: 350,
        MIN_TEMP: 300,
        MAX_TEMP: 400,
        DB_ADDRESS: 'DB1'
      },
      conveyor: {
        DEFAULT_SPEED: 2.5,
        MIN_SPEED: 1.0,
        MAX_SPEED: 5.0,
        DB_ADDRESS: 'DB2'
      },
      press: {
        DEFAULT_PRESSURE: 150,
        MIN_PRESSURE: 100,
        MAX_PRESSURE: 200,
        DB_ADDRESS: 'DB3'
      },
      assembly: {
        DEFAULT_CYCLE_TIME: 30,
        MIN_CYCLE_TIME: 20,
        MAX_CYCLE_TIME: 45,
        DB_ADDRESS: 'DB4'
      }
    };
    
    return defaults[type] || {};
  }

  generateEquipmentConfig(params: ConfigGenerationParams): EquipmentConfig {
    const template = this.templates.get(params.equipmentType);
    if (!template) {
      throw new Error(`Template not found for equipment type: ${params.equipmentType}`);
    }

    // Prepare variables for template substitution
    const variables = {
      EQUIPMENT_ID: params.equipmentId,
      EQUIPMENT_NAME: params.equipmentName,
      LINE_ID: params.lineId,
      ...template.defaultValues,
      ...params.customParams
    };

    // Substitute variables in template
    const configStr = this.substituteVariables(JSON.stringify(template.template), variables);
    const config = JSON.parse(configStr);

    // Validate generated configuration
    const validation = this.validator.validateEquipment(config);
    if (!validation.isValid) {
      throw new Error(`Generated configuration is invalid: ${validation.errors.join(', ')}`);
    }

    this.logger.info(`Generated configuration for equipment ${params.equipmentId}`, undefined, {
      equipmentType: params.equipmentType,
      lineId: params.lineId
    });

    return config;
  }

  private substituteVariables(template: string, variables: Record<string, unknown>): string {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    
    return result;
  }

  generateLineConfiguration(lineId: string, equipmentList: ConfigGenerationParams[]): EquipmentConfig[] {
    const configs: EquipmentConfig[] = [];
    
    for (const params of equipmentList) {
      const config = this.generateEquipmentConfig(params);
      configs.push(config);
    }
    
    this.logger.info(`Generated configuration for line ${lineId}`, undefined, {
      equipmentCount: configs.length
    });
    
    return configs;
  }

  saveConfiguration(filePath: string, config: EquipmentConfig[]): void {
    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Validate all configurations
      for (const equipmentConfig of config) {
        const validation = this.validator.validateEquipment(equipmentConfig);
        if (!validation.isValid) {
          throw new Error(`Invalid configuration for ${equipmentConfig.id}: ${validation.errors.join(', ')}`);
        }
      }

      // Write configuration file
      writeFileSync(filePath, JSON.stringify(config, null, 2));
      
      this.logger.info(`Saved configuration to ${filePath}`, undefined, {
        equipmentCount: config.length
      });
    } catch {
      this.logger.error(`Failed to save configuration to ${filePath}`, error as Error);
      throw error;
    }
  }

  loadConfiguration(filePath: string): EquipmentConfig[] {
    try {
      const configData = readFileSync(filePath, 'utf-8');
      const config = JSON.parse(configData);
      
      // Validate configuration
      const configs = Array.isArray(config) ? config : [config];
      for (const equipmentConfig of configs) {
        const validation = this.validator.validateEquipment(equipmentConfig);
        if (!validation.isValid) {
          throw new Error(`Invalid configuration for ${equipmentConfig.id}: ${validation.errors.join(', ')}`);
        }
      }
      
      this.logger.info(`Loaded configuration from ${filePath}`, undefined, {
        equipmentCount: configs.length
      });
      
      return configs;
    } catch {
      this.logger.error(`Failed to load configuration from ${filePath}`, error as Error);
      throw error;
    }
  }

  createEnvironmentConfig(): EnvironmentConfig {
    return {
      development: {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD
        },
        influxdb: {
          url: process.env.INFLUXDB_URL || 'http://localhost:8086',
          token: process.env.INFLUXDB_TOKEN || 'dev-token',
          org: process.env.INFLUXDB_ORG || 'factory-dashboard',
          bucket: process.env.INFLUXDB_BUCKET || 'factory-data-dev'
        },
        updateInterval: 5000,
        logLevel: 'debug'
      },
      staging: {
        redis: {
          host: process.env.REDIS_HOST || 'redis-staging',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD
        },
        influxdb: {
          url: process.env.INFLUXDB_URL || 'http://influxdb-staging:8086',
          token: process.env.INFLUXDB_TOKEN || 'staging-token',
          org: process.env.INFLUXDB_ORG || 'factory-dashboard',
          bucket: process.env.INFLUXDB_BUCKET || 'factory-data-staging'
        },
        updateInterval: 3000,
        logLevel: 'info'
      },
      production: {
        redis: {
          host: process.env.REDIS_HOST || 'redis-prod',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD
        },
        influxdb: {
          url: process.env.INFLUXDB_URL || 'http://influxdb-prod:8086',
          token: process.env.INFLUXDB_TOKEN || 'prod-token',
          org: process.env.INFLUXDB_ORG || 'factory-dashboard',
          bucket: process.env.INFLUXDB_BUCKET || 'factory-data-prod'
        },
        updateInterval: 2000,
        logLevel: 'warn'
      }
    };
  }

  migrateConfiguration(oldConfigPath: string, newConfigPath: string, migrationRules?: Record<string, unknown>): void {
    try {
      const oldConfig = this.loadConfiguration(oldConfigPath);
      const migratedConfig = this.applyMigrationRules(oldConfig, migrationRules || {});
      this.saveConfiguration(newConfigPath, migratedConfig);
      
      this.logger.info(`Migrated configuration from ${oldConfigPath} to ${newConfigPath}`, undefined, {
        equipmentCount: migratedConfig.length
      });
    } catch {
      this.logger.error(`Failed to migrate configuration`, error as Error);
      throw error;
    }
  }

  private applyMigrationRules(config: EquipmentConfig[], rules: Record<string, unknown>): EquipmentConfig[] {
    // Apply migration rules to transform old configuration format to new format
    // This is a simplified implementation - real migration would be more complex
    return config.map(equipment => ({
      ...equipment,
      ...rules
    }));
  }

  getAvailableTemplates(): ConfigTemplate[] {
    return Array.from(this.templates.values());
  }

  validateAllConfigurations(/* _configDir: string */): { valid: EquipmentConfig[]; invalid: { file: string; errors: string[] }[] } {
    const valid: EquipmentConfig[] = [];
    const invalid: { file: string; errors: string[] }[] = [];
    
    // This would scan the directory for configuration files and validate them
    // Implementation would depend on the directory structure
    
    return { valid, invalid };
  }
}