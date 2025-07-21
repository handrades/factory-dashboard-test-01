import { MessageTransformer, TransformationConfig } from '../message-transformer';
import { PLCMessage } from '@factory-dashboard/shared-types';

describe('MessageTransformer', () => {
  let transformer: MessageTransformer;
  let config: TransformationConfig;

  beforeEach(() => {
    config = {
      defaultMeasurement: 'plc_data',
      equipmentTypeMapping: {
        'oven': 'oven_metrics',
        'conveyor': 'conveyor_metrics',
        'press': 'press_metrics',
        'assembly': 'assembly_metrics'
      },
      tagRules: [
        {
          tagId: 'temperature',
          measurement: 'temperature',
          field: 'value',
          validate: (value) => typeof value === 'number' && value >= -50 && value <= 1000
        },
        {
          tagId: 'pressure',
          measurement: 'pressure',
          field: 'value',
          validate: (value) => typeof value === 'number' && value >= 0 && value <= 1000,
          transform: (value: unknown) => (typeof value === 'number' ? value * 1.01 : value) // Apply calibration factor
        },
        {
          tagId: 'speed',
          measurement: 'speed',
          field: 'value',
          tags: { unit: 'mps' } // Add additional tags
        }
      ],
      includeQualityMetrics: true,
      timestampPrecision: 'ms'
    };

    transformer = new MessageTransformer(config);
  });

  describe('transformMessage', () => {
    it('should transform PLCMessage with hierarchical tag structure', async () => {
      const message: PLCMessage = {
        id: 'test-msg-001',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'oven1',
        site: 'mexico',
        productType: 'mudguard',
        lineNumber: 1,
        messageType: 'DATA_UPDATE',
        tags: [
          {
            tagId: 'temperature',
            value: 350.5,
            quality: 'GOOD'
          },
          {
            tagId: 'door_status',
            value: false,
            quality: 'GOOD'
          }
        ]
      };

      const dataPoints = await transformer.transformMessage(message);

      expect(dataPoints).toHaveLength(3); // 2 tag data points + 1 quality metrics

      // Check temperature data point
      const tempDataPoint = dataPoints.find(dp => dp.measurement === 'temperature');
      expect(tempDataPoint).toBeDefined();
      expect(tempDataPoint?.tags).toEqual({
        site: 'mexico',
        type: 'mudguard',
        line: '1',
        equipment_id: 'oven1',
        tag: 'temperature'
      });
      expect(tempDataPoint?.fields).toEqual({ value: 350.5 });

      // Check door status data point
      const doorDataPoint = dataPoints.find(dp => dp.measurement === 'plc_data' && dp.fields.door_status !== undefined);
      expect(doorDataPoint).toBeDefined();
      expect(doorDataPoint?.tags).toEqual({
        site: 'mexico',
        type: 'mudguard',
        line: '1',
        equipment_id: 'oven1',
        tag: 'door_status'
      });
      expect(doorDataPoint?.fields).toEqual({ door_status: false });

      // Check quality metrics data point
      const qualityDataPoint = dataPoints.find(dp => dp.measurement === 'message_quality');
      expect(qualityDataPoint).toBeDefined();
      expect(qualityDataPoint?.tags).toEqual({
        site: 'mexico',
        type: 'mudguard',
        line: '1',
        equipment_id: 'oven1',
        tag: 'quality_metrics'
      });
      expect(qualityDataPoint?.fields).toEqual({
        total_tags: 2,
        good_quality_tags: 2,
        bad_quality_tags: 0,
        uncertain_quality_tags: 0,
        quality_ratio: 1
      });
    });

    it('should apply tag rules correctly', async () => {
      const message: PLCMessage = {
        id: 'test-msg-002',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'press1',
        site: 'usa',
        productType: 'esm',
        lineNumber: 2,
        messageType: 'DATA_UPDATE',
        tags: [
          {
            tagId: 'pressure',
            value: 100,
            quality: 'GOOD'
          },
          {
            tagId: 'speed',
            value: 2.5,
            quality: 'GOOD'
          }
        ]
      };

      const dataPoints = await transformer.transformMessage(message);

      // Check pressure transformation (should apply calibration factor)
      const pressureDataPoint = dataPoints.find(dp => dp.measurement === 'pressure');
      expect(pressureDataPoint?.fields.value).toBeCloseTo(101); // 100 * 1.01

      // Check speed additional tags
      const speedDataPoint = dataPoints.find(dp => dp.measurement === 'speed');
      expect(speedDataPoint?.tags).toEqual({
        site: 'usa',
        type: 'esm',
        line: '2',
        equipment_id: 'press1',
        tag: 'speed',
        unit: 'mps'
      });
    });

    it('should handle validation failures', async () => {
      const message: PLCMessage = {
        id: 'test-msg-003',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'oven1',
        site: 'mexico',
        productType: 'mudguard',
        lineNumber: 1,
        messageType: 'DATA_UPDATE',
        tags: [
          {
            tagId: 'temperature',
            value: 1500, // Invalid temperature (> 1000)
            quality: 'GOOD'
          },
          {
            tagId: 'door_status',
            value: true,
            quality: 'GOOD'
          }
        ]
      };

      const dataPoints = await transformer.transformMessage(message);

      // Should only have door_status and quality metrics (temperature should be skipped)
      expect(dataPoints).toHaveLength(2);
      expect(dataPoints.find(dp => dp.measurement === 'temperature')).toBeUndefined();
      expect(dataPoints.find(dp => dp.fields.door_status !== undefined)).toBeDefined();
    });

    it('should handle complex object values', async () => {
      const message: PLCMessage = {
        id: 'test-msg-004',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'assembly1',
        site: 'china',
        productType: 'fleece',
        lineNumber: 3,
        messageType: 'DATA_UPDATE',
        tags: [
          {
            tagId: 'diagnostics',
            value: {
              cpu_usage: 75.5,
              memory_usage: 60.2,
              network: {
                rx_bytes: 1024,
                tx_bytes: 2048
              }
            },
            quality: 'GOOD'
          }
        ]
      };

      const dataPoints = await transformer.transformMessage(message);

      // Should create multiple data points for nested object
      expect(dataPoints.length).toBeGreaterThan(2);

      // Check that nested values are flattened
      const cpuDataPoint = dataPoints.find(dp => dp.fields.cpu_usage !== undefined);
      expect(cpuDataPoint?.fields.cpu_usage).toBe(75.5);

      const networkRxDataPoint = dataPoints.find(dp => dp.fields.network_rx_bytes !== undefined);
      expect(networkRxDataPoint?.fields.network_rx_bytes).toBe(1024);
    });

    it('should handle different quality values in quality metrics', async () => {
      const message: PLCMessage = {
        id: 'test-msg-005',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'conveyor1',
        site: 'mexico',
        productType: 'mudguard',
        lineNumber: 1,
        messageType: 'DATA_UPDATE',
        tags: [
          { tagId: 'speed', value: 2.5, quality: 'GOOD' },
          { tagId: 'temperature', value: 25, quality: 'BAD' },
          { tagId: 'vibration', value: 0.1, quality: 'UNCERTAIN' },
          { tagId: 'voltage', value: 24, quality: 'GOOD' }
        ]
      };

      const dataPoints = await transformer.transformMessage(message);
      const qualityDataPoint = dataPoints.find(dp => dp.measurement === 'message_quality');

      expect(qualityDataPoint?.fields).toEqual({
        total_tags: 4,
        good_quality_tags: 2,
        bad_quality_tags: 1,
        uncertain_quality_tags: 1,
        quality_ratio: 0.5
      });
    });

    it('should disable quality metrics when configured', async () => {
      const configWithoutQuality = { ...config, includeQualityMetrics: false };
      const transformerWithoutQuality = new MessageTransformer(configWithoutQuality);

      const message: PLCMessage = {
        id: 'test-msg-006',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'oven1',
        site: 'mexico',
        productType: 'mudguard',
        lineNumber: 1,
        messageType: 'DATA_UPDATE',
        tags: [
          { tagId: 'temperature', value: 350, quality: 'GOOD' }
        ]
      };

      const dataPoints = await transformerWithoutQuality.transformMessage(message);

      expect(dataPoints).toHaveLength(1); // Only temperature, no quality metrics
      expect(dataPoints.find(dp => dp.measurement === 'message_quality')).toBeUndefined();
    });
  });

  describe('equipment-specific transformations', () => {
    it('should transform oven data with hierarchical tags', async () => {
      const message: PLCMessage = {
        id: 'test-oven-001',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'oven1',
        site: 'mexico',
        productType: 'mudguard',
        lineNumber: 1,
        messageType: 'DATA_UPDATE',
        tags: [
          { tagId: 'temperature', value: 380, quality: 'GOOD' },
          { tagId: 'heating_status', value: true, quality: 'GOOD' },
          { tagId: 'door_status', value: false, quality: 'GOOD' }
        ]
      };

      const dataPoints = transformer.transformOvenData(message);

      expect(dataPoints).toHaveLength(3);

      // Check temperature mapping
      const tempDataPoint = dataPoints.find(dp => dp.measurement === 'temperature');
      expect(tempDataPoint?.tags).toEqual({
        site: 'mexico',
        type: 'mudguard',
        line: '1',
        equipment_id: 'oven1',
        tag: 'temperature'
      });
      expect(tempDataPoint?.fields).toEqual({ value: 380 });

      // Check heating status mapping
      const heatingDataPoint = dataPoints.find(dp => dp.measurement === 'heating_status');
      expect(heatingDataPoint?.tags).toEqual({
        site: 'mexico',
        type: 'mudguard',
        line: '1',
        equipment_id: 'oven1',
        tag: 'heating_status'
      });
      expect(heatingDataPoint?.fields).toEqual({ enabled: true });
    });

    it('should transform conveyor data with hierarchical tags', async () => {
      const message: PLCMessage = {
        id: 'test-conveyor-001',
        timestamp: new Date('2024-01-15T10:30:00Z'),
        equipmentId: 'conveyor1',
        site: 'usa',
        productType: 'esm',
        lineNumber: 2,
        messageType: 'DATA_UPDATE',
        tags: [
          { tagId: 'speed', value: 2.8, quality: 'GOOD' },
          { tagId: 'motor_status', value: true, quality: 'GOOD' }
        ]
      };

      const dataPoints = transformer.transformConveyorData(message);

      expect(dataPoints).toHaveLength(2);

      const speedDataPoint = dataPoints.find(dp => dp.measurement === 'conveyor_speed');
      expect(speedDataPoint?.tags).toEqual({
        site: 'usa',
        type: 'esm',
        line: '2',
        equipment_id: 'conveyor1',
        tag: 'speed'
      });
    });
  });

  describe('getTransformationStats', () => {
    it('should track transformation statistics', async () => {
      const message: PLCMessage = {
        id: 'test-stats-001',
        timestamp: new Date(),
        equipmentId: 'oven1',
        site: 'mexico',
        productType: 'mudguard',
        lineNumber: 1,
        messageType: 'DATA_UPDATE',
        tags: [
          { tagId: 'temperature', value: 350, quality: 'GOOD' }
        ]
      };

      await transformer.transformMessage(message);
      await transformer.transformMessage(message);

      const stats = transformer.getTransformationStats();

      expect(stats.messagesProcessed).toBe(2);
      expect(stats.dataPointsCreated).toBeGreaterThan(0);
      expect(stats.transformationErrors).toBe(0);
    });

    it('should track transformation errors', async () => {
      const invalidMessage = {
        id: '',
        timestamp: null,
        equipmentId: 'oven1'
      } as unknown as PLCMessage;

      try {
        await transformer.transformMessage(invalidMessage);
      } catch {
        // Expected to throw
      }

      const stats = transformer.getTransformationStats();
      expect(stats.transformationErrors).toBe(1);
    });
  });
});