import { PLCMessage, DataPoint } from '@factory-dashboard/shared-types';
import { createLogger } from 'winston';

export interface TransformationRule {
  tagId: string | RegExp;
  measurement: string;
  field: string;
  tags?: Record<string, string>;
  transform?: (value: any) => any;
  validate?: (value: any) => boolean;
}

export interface TransformationConfig {
  defaultMeasurement: string;
  equipmentTypeMapping: Record<string, string>;
  tagRules: TransformationRule[];
  includeQualityMetrics: boolean;
  timestampPrecision: 'ns' | 'ms' | 's';
}

export class MessageTransformer {
  private config: TransformationConfig;
  private logger: ReturnType<typeof createLogger>;
  private transformationStats: {
    messagesProcessed: number;
    dataPointsCreated: number;
    transformationErrors: number;
  } = {
    messagesProcessed: 0,
    dataPointsCreated: 0,
    transformationErrors: 0
  };

  constructor(config: TransformationConfig) {
    this.config = config;
    this.logger = createLogger({
      level: 'info',
      format: require('winston').format.combine(
        require('winston').format.timestamp(),
        require('winston').format.json()
      ),
      transports: [
        new (require('winston').transports.Console)(),
        new (require('winston').transports.File)({ filename: 'message-transformer.log' })
      ]
    });
  }

  async transformMessage(message: PLCMessage): Promise<DataPoint[]> {
    try {
      this.transformationStats.messagesProcessed++;
      
      const dataPoints: DataPoint[] = [];
      
      // Validate message
      if (!this.validateMessage(message)) {
        throw new Error('Invalid message structure');
      }

      // Transform each tag in the message
      for (const tag of message.tags) {
        const transformedPoints = await this.transformTag(message, tag);
        dataPoints.push(...transformedPoints);
      }

      // Add message-level metadata if configured
      if (this.config.includeQualityMetrics) {
        const qualityPoint = this.createQualityDataPoint(message);
        if (qualityPoint) {
          dataPoints.push(qualityPoint);
        }
      }

      this.transformationStats.dataPointsCreated += dataPoints.length;
      
      return dataPoints;
    } catch (error) {
      this.transformationStats.transformationErrors++;
      this.logger.error(`Error transforming message ${message.id}: ${error}`);
      throw error;
    }
  }

  private async transformTag(message: PLCMessage, tag: any): Promise<DataPoint[]> {
    const dataPoints: DataPoint[] = [];
    
    // Find transformation rule for this tag
    const rule = this.config.tagRules.find(r => {
      if (typeof r.tagId === 'string') {
        return r.tagId === tag.tagId;
      } else if (r.tagId instanceof RegExp) {
        return r.tagId.test(tag.tagId);
      }
      return false;
    });
    
    // Debug logging
    if (process.env.NODE_ENV === 'development' || process.env.LOG_TRANSFORMATIONS === 'true') {
      this.logger.info(`Tag transformation for ${tag.tagId}`, {
        tagId: tag.tagId,
        ruleFound: !!rule,
        ruleMeasurement: rule?.measurement,
        ruleField: rule?.field
      });
    }
    
    // Apply validation if specified
    if (rule?.validate && !rule.validate(tag.value)) {
      this.logger.warn(`Tag ${tag.tagId} failed validation, skipping`);
      return dataPoints;
    }

    // Apply transformation if specified
    let transformedValue = tag.value;
    if (rule?.transform) {
      try {
        transformedValue = rule.transform(tag.value);
      } catch (error) {
        this.logger.error(`Error transforming tag ${tag.tagId}: ${error}`);
        return dataPoints;
      }
    }

    // Create hierarchical tags based on the new structure
    const baseTags = {
      site: message.site,
      type: message.productType,
      line: message.lineNumber.toString(),
      equipment_id: message.equipmentId,
      tag: tag.tagId,
      ...rule?.tags
    };

    // Determine measurement and field names
    const measurement = rule?.measurement || this.config.defaultMeasurement;
    const field = rule?.field || tag.tagId;

    // Create data point
    const dataPoint: DataPoint = {
      measurement,
      tags: baseTags,
      fields: {
        [field]: transformedValue
      },
      timestamp: this.normalizeTimestamp(message.timestamp)
    };

    dataPoints.push(dataPoint);

    // Create additional data points for complex values
    if (typeof transformedValue === 'object' && transformedValue !== null) {
      const additionalPoints = this.createDataPointsFromObject(
        measurement,
        baseTags,
        transformedValue,
        message.timestamp
      );
      dataPoints.push(...additionalPoints);
    }

    return dataPoints;
  }

  private createDataPointsFromObject(
    measurement: string,
    baseTags: Record<string, string>,
    obj: any,
    timestamp: Date,
    prefix: string = ''
  ): DataPoint[] {
    const dataPoints: DataPoint[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}_${key}` : key;
      
      if (typeof value === 'object' && value !== null) {
        // Recursively handle nested objects
        const nestedPoints = this.createDataPointsFromObject(
          measurement,
          baseTags,
          value,
          timestamp,
          fieldName
        );
        dataPoints.push(...nestedPoints);
      } else {
        // Create data point for primitive value
        const dataPoint: DataPoint = {
          measurement,
          tags: baseTags,
          fields: {
            [fieldName]: value
          },
          timestamp: this.normalizeTimestamp(timestamp)
        };
        dataPoints.push(dataPoint);
      }
    }

    return dataPoints;
  }

  private createQualityDataPoint(message: PLCMessage): DataPoint | null {
    const goodQualityCount = message.tags.filter(t => t.quality === 'GOOD').length;
    const badQualityCount = message.tags.filter(t => t.quality === 'BAD').length;
    const uncertainQualityCount = message.tags.filter(t => t.quality === 'UNCERTAIN').length;
    
    return {
      measurement: 'message_quality',
      tags: {
        site: message.site,
        type: message.productType,
        line: message.lineNumber.toString(),
        equipment_id: message.equipmentId,
        tag: 'quality_metrics'
      },
      fields: {
        total_tags: message.tags.length,
        good_quality_tags: goodQualityCount,
        bad_quality_tags: badQualityCount,
        uncertain_quality_tags: uncertainQualityCount,
        quality_ratio: goodQualityCount / message.tags.length
      },
      timestamp: this.normalizeTimestamp(message.timestamp)
    };
  }

  private validateMessage(message: PLCMessage): boolean {
    if (!message.id || !message.timestamp || !message.equipmentId) {
      return false;
    }

    if (!message.tags || !Array.isArray(message.tags)) {
      return false;
    }

    for (const tag of message.tags) {
      if (!tag.tagId || tag.value === undefined || !tag.quality) {
        return false;
      }
    }

    return true;
  }

  private normalizeTimestamp(timestamp: Date): Date {
    // Ensure timestamp is valid
    if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
      this.logger.warn('Invalid timestamp, using current time');
      return new Date();
    }

    // Handle precision based on configuration
    switch (this.config.timestampPrecision) {
      case 'ns':
        return timestamp;
      case 'ms':
        return new Date(Math.floor(timestamp.getTime()));
      case 's':
        return new Date(Math.floor(timestamp.getTime() / 1000) * 1000);
      default:
        return timestamp;
    }
  }

  // Equipment-specific transformation methods - now using hierarchical tag structure
  transformOvenData(message: PLCMessage): DataPoint[] {
    const dataPoints: DataPoint[] = [];
    
    for (const tag of message.tags) {
      let measurement = 'oven_metrics';
      let field = tag.tagId;
      
      // Map tag types to specific measurements
      if (tag.tagId.includes('temperature')) {
        measurement = 'temperature';
        field = 'value';
      } else if (tag.tagId.includes('heating_status')) {
        measurement = 'heating_status';
        field = 'enabled';
      } else if (tag.tagId.includes('door_status')) {
        measurement = 'door_status';
        field = 'open';
      }
      
      const dataPoint: DataPoint = {
        measurement,
        tags: {
          site: message.site,
          type: message.productType,
          line: message.lineNumber.toString(),
          equipment_id: message.equipmentId,
          tag: tag.tagId
        },
        fields: {
          [field]: tag.value
        },
        timestamp: this.normalizeTimestamp(message.timestamp)
      };
      
      dataPoints.push(dataPoint);
    }
    
    return dataPoints;
  }

  transformConveyorData(message: PLCMessage): DataPoint[] {
    const dataPoints: DataPoint[] = [];
    
    for (const tag of message.tags) {
      let measurement = 'conveyor_metrics';
      let field = tag.tagId;
      
      if (tag.tagId.includes('speed')) {
        measurement = 'conveyor_speed';
        field = 'value';
      } else if (tag.tagId.includes('motor_status')) {
        measurement = 'motor_status';
        field = 'running';
      } else if (tag.tagId.includes('belt_tension')) {
        measurement = 'belt_tension';
        field = 'value';
      }
      
      const dataPoint: DataPoint = {
        measurement,
        tags: {
          site: message.site,
          type: message.productType,
          line: message.lineNumber.toString(),
          equipment_id: message.equipmentId,
          tag: tag.tagId
        },
        fields: {
          [field]: tag.value
        },
        timestamp: this.normalizeTimestamp(message.timestamp)
      };
      
      dataPoints.push(dataPoint);
    }
    
    return dataPoints;
  }

  transformPressData(message: PLCMessage): DataPoint[] {
    const dataPoints: DataPoint[] = [];
    
    for (const tag of message.tags) {
      let measurement = 'press_metrics';
      let field = tag.tagId;
      
      if (tag.tagId.includes('pressure')) {
        measurement = 'hydraulic_pressure';
        field = 'value';
      } else if (tag.tagId.includes('cycle_count')) {
        measurement = 'cycle_count';
        field = 'value';
      } else if (tag.tagId.includes('position')) {
        measurement = 'press_position';
        field = 'value';
      }
      
      const dataPoint: DataPoint = {
        measurement,
        tags: {
          site: message.site,
          type: message.productType,
          line: message.lineNumber.toString(),
          equipment_id: message.equipmentId,
          tag: tag.tagId
        },
        fields: {
          [field]: tag.value
        },
        timestamp: this.normalizeTimestamp(message.timestamp)
      };
      
      dataPoints.push(dataPoint);
    }
    
    return dataPoints;
  }

  transformAssemblyData(message: PLCMessage): DataPoint[] {
    const dataPoints: DataPoint[] = [];
    
    for (const tag of message.tags) {
      let measurement = 'assembly_metrics';
      let field = tag.tagId;
      
      if (tag.tagId.includes('station') && tag.tagId.includes('status')) {
        measurement = 'station_status';
        field = 'active';
      } else if (tag.tagId.includes('cycle_time')) {
        measurement = 'cycle_time';
        field = 'value';
      }
      
      const dataPoint: DataPoint = {
        measurement,
        tags: {
          site: message.site,
          type: message.productType,
          line: message.lineNumber.toString(),
          equipment_id: message.equipmentId,
          tag: tag.tagId
        },
        fields: {
          [field]: tag.value
        },
        timestamp: this.normalizeTimestamp(message.timestamp)
      };
      
      dataPoints.push(dataPoint);
    }
    
    return dataPoints;
  }

  getTransformationStats(): {
    messagesProcessed: number;
    dataPointsCreated: number;
    transformationErrors: number;
  } {
    return { ...this.transformationStats };
  }

  resetStats(): void {
    this.transformationStats = {
      messagesProcessed: 0,
      dataPointsCreated: 0,
      transformationErrors: 0
    };
  }
}