import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { LineConfig } from '@factory-dashboard/shared-types';
import winston, { createLogger } from 'winston';

export interface DynamicQueueDiscoveryOptions {
  configDirectory: string;
  queueNamePrefix?: string;
}

export class DynamicQueueDiscovery {
  private configDirectory: string;
  private queueNamePrefix: string;
  private logger: ReturnType<typeof createLogger>;

  constructor(options: DynamicQueueDiscoveryOptions) {
    this.configDirectory = resolve(options.configDirectory);
    this.queueNamePrefix = options.queueNamePrefix || 'plc_data_';
    this.logger = createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console()
      ]
    });
  }

  async discoverQueueNames(): Promise<string[]> {
    try {
      const lineFiles = this.getLineConfigFiles();
      const queueNames: string[] = [];

      for (const lineFile of lineFiles) {
        const lineConfig = this.loadLineConfig(lineFile);
        const equipmentQueueNames = this.extractQueueNamesFromLine(lineConfig);
        queueNames.push(...equipmentQueueNames);
      }

      this.logger.info(`Discovered ${queueNames.length} queue names from ${lineFiles.length} line configurations`);
      return queueNames;
    } catch {
      this.logger.error(`Failed to discover queue names: ${error}`);
      throw error;
    }
  }

  private getLineConfigFiles(): string[] {
    try {
      const files = readdirSync(this.configDirectory);
      const lineFiles = files
        .filter(file => file.startsWith('line') && file.endsWith('.json'))
        .map(file => join(this.configDirectory, file));
      
      this.logger.info(`Found ${lineFiles.length} line configuration files in ${this.configDirectory}`);
      return lineFiles;
    } catch {
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
    } catch {
      this.logger.error(`Failed to load line config from ${filePath}: ${error}`);
      throw error;
    }
  }

  private extractQueueNamesFromLine(lineConfig: LineConfig): string[] {
    const queueNames: string[] = [];

    for (const equipment of lineConfig.equipment) {
      // Queue name format: plc_data_{equipmentId}
      const queueName = `${this.queueNamePrefix}${equipment.id}`;
      queueNames.push(queueName);
    }

    this.logger.debug(`Extracted ${queueNames.length} queue names from line ${lineConfig.line}`);
    return queueNames;
  }

  async getEquipmentSummary(): Promise<{
    totalEquipment: number;
    equipmentByLine: Record<string, string[]>;
    equipmentBySite: Record<string, string[]>;
    equipmentByType: Record<string, string[]>;
  }> {
    const lineFiles = this.getLineConfigFiles();
    const summary = {
      totalEquipment: 0,
      equipmentByLine: {} as Record<string, string[]>,
      equipmentBySite: {} as Record<string, string[]>,
      equipmentByType: {} as Record<string, string[]>
    };

    for (const lineFile of lineFiles) {
      const lineConfig = this.loadLineConfig(lineFile);
      
      const lineKey = `line${lineConfig.line}`;
      const siteKey = lineConfig.site;
      const typeKey = lineConfig.type;

      summary.equipmentByLine[lineKey] = [];
      
      if (!summary.equipmentBySite[siteKey]) {
        summary.equipmentBySite[siteKey] = [];
      }
      
      if (!summary.equipmentByType[typeKey]) {
        summary.equipmentByType[typeKey] = [];
      }

      for (const equipment of lineConfig.equipment) {
        summary.totalEquipment++;
        summary.equipmentByLine[lineKey].push(equipment.id);
        summary.equipmentBySite[siteKey].push(equipment.id);
        summary.equipmentByType[typeKey].push(equipment.id);
      }
    }

    return summary;
  }
}