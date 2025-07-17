import { LineConfigLoader } from '../../services/plc-emulator/src/config/line-config-loader';
import { DynamicQueueDiscovery } from '../../services/queue-consumer/src/config/dynamic-queue-discovery';
import { MessageTransformer } from '../../services/queue-consumer/src/processing/message-transformer';
import { MessageFormatter } from '../../services/plc-emulator/src/messaging/message-formatter';
import { LineConfig, PLCMessage, DataPoint } from '../../services/shared-types/src';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('End-to-End Integration Tests', () => {
  let tempConfigDir: string;
  let lineConfigLoader: LineConfigLoader;
  let queueDiscovery: DynamicQueueDiscovery;
  let messageTransformer: MessageTransformer;
  let messageFormatter: MessageFormatter;

  beforeEach(() => {
    // Create temporary config directory with realistic production line data
    tempConfigDir = join(__dirname, 'temp-integration-config');
    mkdirSync(tempConfigDir, { recursive: true });

    // Create comprehensive line configurations that mirror production setup
    const productionLineConfigs: LineConfig[] = [
      {
        id: 1,
        name: 'Mudguard Line Mexico',
        site: 'mexico',
        type: 'mudguard',
        line: 1,
        equipment: [
          {
            id: 'oven1_mexico',
            name: 'Primary Curing Oven',
            type: 'oven',
            status: 'running',
            tags: [
              {
                id: 'temperature',
                name: 'Temperature Sensor',
                dataType: 'REAL',
                value: 350,
                behavior: {
                  type: 'sinusoidal',
                  parameters: { min: 300, max: 400, period: 60000 }
                }
              },
              {
                id: 'door_status',
                name: 'Door Status',
                dataType: 'BOOL',
                value: false,
                behavior: {
                  type: 'discrete',
                  parameters: { values: [true, false], probabilities: [0.1, 0.9] }
                }
              },
              {
                id: 'heating_status',
                name: 'Heating Element Status',
                dataType: 'BOOL',
                value: true,
                behavior: {
                  type: 'constant',
                  parameters: { value: true }
                }
              }
            ]
          },
          {
            id: 'conveyor1_mexico',
            name: 'Main Transfer Conveyor',
            type: 'conveyor',
            status: 'running',
            tags: [
              {
                id: 'speed',
                name: 'Belt Speed',
                dataType: 'REAL',
                value: 2.5,
                behavior: {
                  type: 'normal',
                  parameters: { mean: 2.5, stddev: 0.1 }
                }
              },
              {
                id: 'motor_status',
                name: 'Motor Status',
                dataType: 'BOOL',
                value: true,
                behavior: {
                  type: 'constant',
                  parameters: { value: true }
                }
              }
            ]
          }
        ]
      },
      {
        id: 2,
        name: 'ESM Line USA',
        site: 'usa',
        type: 'esm',
        line: 2,
        equipment: [
          {
            id: 'press1_usa',
            name: 'Hydraulic Press Station',
            type: 'press',
            status: 'running',
            tags: [
              {
                id: 'pressure',
                name: 'Hydraulic Pressure',
                dataType: 'REAL',
                value: 150,
                behavior: {
                  type: 'normal',
                  parameters: { mean: 150, stddev: 10 }
                }
              },
              {
                id: 'cycle_count',
                name: 'Press Cycle Count',
                dataType: 'INT',
                value: 0,
                behavior: {
                  type: 'counter',
                  parameters: { increment: 1, reset_at: 1000 }
                }
              },
              {
                id: 'position',
                name: 'Press Position',
                dataType: 'REAL',
                value: 0,
                behavior: {
                  type: 'sinusoidal',
                  parameters: { min: 0, max: 100, period: 30000 }
                }
              }
            ]
          }
        ]
      },
      {
        id: 3,
        name: 'Fleece Line China',
        site: 'china',
        type: 'fleece',
        line: 3,
        equipment: [
          {
            id: 'assembly1_china',
            name: 'Primary Assembly Station',
            type: 'assembly',
            status: 'running',
            tags: [
              {
                id: 'cycle_time',
                name: 'Assembly Cycle Time',
                dataType: 'REAL',
                value: 45,
                behavior: {
                  type: 'normal',
                  parameters: { mean: 45, stddev: 5 }
                }
              },
              {
                id: 'station_status',
                name: 'Station Status',
                dataType: 'BOOL',
                value: true,
                behavior: {
                  type: 'discrete',
                  parameters: { values: [true, false], probabilities: [0.95, 0.05] }
                }
              }
            ]
          },
          {
            id: 'assembly2_china',
            name: 'Secondary Assembly Station',
            type: 'assembly',
            status: 'running',
            tags: [
              {
                id: 'cycle_time',
                name: 'Assembly Cycle Time',
                dataType: 'REAL',
                value: 50,
                behavior: {
                  type: 'normal',
                  parameters: { mean: 50, stddev: 7 }
                }
              }
            ]
          }
        ]
      }
    ];

    // Write line configuration files
    productionLineConfigs.forEach((lineConfig, index) => {
      writeFileSync(
        join(tempConfigDir, `line${index + 1}.json`),
        JSON.stringify(lineConfig, null, 2)
      );
    });

    // Initialize components
    lineConfigLoader = new LineConfigLoader({
      configDirectory: tempConfigDir,
      watchForChanges: false
    });

    queueDiscovery = new DynamicQueueDiscovery({
      configDirectory: tempConfigDir,
      queueNamePrefix: 'plc_data_'
    });

    messageTransformer = new MessageTransformer({
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
          validate: (value) => typeof value === 'number' && value >= 0 && value <= 1000
        },
        {
          tagId: 'speed',
          measurement: 'speed',
          field: 'value'
        },
        {
          tagId: 'cycle_time',
          measurement: 'cycle_time',
          field: 'value'
        }
      ],
      includeQualityMetrics: true,
      timestampPrecision: 'ms'
    });

    messageFormatter = new MessageFormatter();
  });

  afterEach(() => {
    rmSync(tempConfigDir, { recursive: true, force: true });
  });

  describe('Complete Data Flow Integration', () => {
    it('should process complete data flow from config to InfluxDB format', async () => {
      // Step 1: Load equipment configurations from line files
      const equipmentConfigs = await lineConfigLoader.loadConfiguration();
      
      expect(equipmentConfigs).toHaveLength(5); // 2 + 1 + 2 equipment pieces
      
      // Verify equipment metadata is correctly loaded
      const ovenEquipment = equipmentConfigs.find(eq => eq.id === 'oven1_mexico');
      expect(ovenEquipment).toBeDefined();
      expect(ovenEquipment?.site).toBe('mexico');
      expect(ovenEquipment?.productType).toBe('mudguard');
      expect(ovenEquipment?.lineNumber).toBe(1);

      // Step 2: Discover queue names dynamically
      const queueNames = await queueDiscovery.discoverQueueNames();
      
      expect(queueNames).toHaveLength(5);
      expect(queueNames).toContain('plc_data_oven1_mexico');
      expect(queueNames).toContain('plc_data_conveyor1_mexico');
      expect(queueNames).toContain('plc_data_press1_usa');
      expect(queueNames).toContain('plc_data_assembly1_china');
      expect(queueNames).toContain('plc_data_assembly2_china');

      // Step 3: Generate realistic PLC messages for each equipment
      const plcMessages: PLCMessage[] = [];
      
      for (const equipment of equipmentConfigs) {
        const message = messageFormatter.createPLCMessage(
          equipment.id,
          equipment.site,
          equipment.productType,
          equipment.lineNumber,
          equipment.tags,
          'DATA_UPDATE'
        );
        plcMessages.push(message);
      }

      expect(plcMessages).toHaveLength(5);

      // Step 4: Transform messages to InfluxDB data points
      const allDataPoints: DataPoint[] = [];
      
      for (const message of plcMessages) {
        const dataPoints = await messageTransformer.transformMessage(message);
        allDataPoints.push(...dataPoints);
      }

      // Verify data points structure
      expect(allDataPoints.length).toBeGreaterThan(equipmentConfigs.length); // At least one per equipment + quality metrics

      // Step 5: Validate hierarchical tag structure
      const temperatureDataPoint = allDataPoints.find(dp => 
        dp.measurement === 'temperature' && 
        dp.tags.equipment_id === 'oven1_mexico'
      );
      
      expect(temperatureDataPoint).toBeDefined();
      expect(temperatureDataPoint?.tags).toEqual({
        site: 'mexico',
        type: 'mudguard',
        line: '1',
        equipment_id: 'oven1_mexico',
        tag: 'temperature'
      });
      expect(temperatureDataPoint?.fields.value).toBe(350);

      // Step 6: Validate data points for each site
      const mexicoDataPoints = allDataPoints.filter(dp => dp.tags.site === 'mexico');
      const usaDataPoints = allDataPoints.filter(dp => dp.tags.site === 'usa');
      const chinaDataPoints = allDataPoints.filter(dp => dp.tags.site === 'china');

      expect(mexicoDataPoints.length).toBeGreaterThan(0);
      expect(usaDataPoints.length).toBeGreaterThan(0);
      expect(chinaDataPoints.length).toBeGreaterThan(0);

      // Step 7: Validate product type distribution
      const mudguardDataPoints = allDataPoints.filter(dp => dp.tags.type === 'mudguard');
      const esmDataPoints = allDataPoints.filter(dp => dp.tags.type === 'esm');
      const fleeceDataPoints = allDataPoints.filter(dp => dp.tags.type === 'fleece');

      expect(mudguardDataPoints.length).toBeGreaterThan(0);
      expect(esmDataPoints.length).toBeGreaterThan(0);
      expect(fleeceDataPoints.length).toBeGreaterThan(0);
    });

    it('should handle multi-site equipment summary correctly', async () => {
      const equipmentSummary = await queueDiscovery.getEquipmentSummary();

      expect(equipmentSummary.totalEquipment).toBe(5);
      
      expect(equipmentSummary.equipmentByLine).toEqual({
        'line1': ['oven1_mexico', 'conveyor1_mexico'],
        'line2': ['press1_usa'],
        'line3': ['assembly1_china', 'assembly2_china']
      });

      expect(equipmentSummary.equipmentBySite).toEqual({
        'mexico': ['oven1_mexico', 'conveyor1_mexico'],
        'usa': ['press1_usa'],
        'china': ['assembly1_china', 'assembly2_china']
      });

      expect(equipmentSummary.equipmentByType).toEqual({
        'mudguard': ['oven1_mexico', 'conveyor1_mexico'],
        'esm': ['press1_usa'],
        'fleece': ['assembly1_china', 'assembly2_china']
      });
    });

    it('should generate quality metrics for each message', async () => {
      const equipmentConfigs = await lineConfigLoader.loadConfiguration();
      const ovenEquipment = equipmentConfigs.find(eq => eq.id === 'oven1_mexico');
      
      const message = messageFormatter.createPLCMessage(
        ovenEquipment!.id,
        ovenEquipment!.site,
        ovenEquipment!.productType,
        ovenEquipment!.lineNumber,
        ovenEquipment!.tags,
        'DATA_UPDATE'
      );

      const dataPoints = await messageTransformer.transformMessage(message);
      
      const qualityDataPoint = dataPoints.find(dp => dp.measurement === 'message_quality');
      expect(qualityDataPoint).toBeDefined();
      expect(qualityDataPoint?.tags).toEqual({
        site: 'mexico',
        type: 'mudguard',
        line: '1',
        equipment_id: 'oven1_mexico',
        tag: 'quality_metrics'
      });
      expect(qualityDataPoint?.fields.total_tags).toBe(3);
      expect(qualityDataPoint?.fields.good_quality_tags).toBe(3);
      expect(qualityDataPoint?.fields.quality_ratio).toBe(1);
    });

    it('should handle state change messages correctly', async () => {
      const equipmentConfigs = await lineConfigLoader.loadConfiguration();
      const pressEquipment = equipmentConfigs.find(eq => eq.id === 'press1_usa');
      
      const stateChangeMessage = messageFormatter.createStateChangeMessage(
        pressEquipment!.id,
        pressEquipment!.site,
        pressEquipment!.productType,
        pressEquipment!.lineNumber,
        'running',
        'stopped'
      );

      expect(stateChangeMessage.messageType).toBe('STATE_CHANGE');
      expect(stateChangeMessage.tags).toHaveLength(2);
      expect(stateChangeMessage.tags[0].tagId).toBe('previous_state');
      expect(stateChangeMessage.tags[0].value).toBe('running');
      expect(stateChangeMessage.tags[1].tagId).toBe('current_state');
      expect(stateChangeMessage.tags[1].value).toBe('stopped');

      const dataPoints = await messageTransformer.transformMessage(stateChangeMessage);
      
      // Verify hierarchical tagging for state change
      const stateDataPoints = dataPoints.filter(dp => dp.tags.tag.includes('state'));
      expect(stateDataPoints.length).toBe(2);
      
      stateDataPoints.forEach(dp => {
        expect(dp.tags.site).toBe('usa');
        expect(dp.tags.type).toBe('esm');
        expect(dp.tags.line).toBe('2');
        expect(dp.tags.equipment_id).toBe('press1_usa');
      });
    });

    it('should handle heartbeat messages correctly', async () => {
      const equipmentConfigs = await lineConfigLoader.loadConfiguration();
      const assemblyEquipment = equipmentConfigs.find(eq => eq.id === 'assembly1_china');
      
      const heartbeatMessage = messageFormatter.createHeartbeatMessage(
        assemblyEquipment!.id,
        assemblyEquipment!.site,
        assemblyEquipment!.productType,
        assemblyEquipment!.lineNumber
      );

      expect(heartbeatMessage.messageType).toBe('HEARTBEAT');
      expect(heartbeatMessage.tags).toHaveLength(1);
      expect(heartbeatMessage.tags[0].tagId).toBe('heartbeat');
      expect(heartbeatMessage.tags[0].value).toBe(true);

      const dataPoints = await messageTransformer.transformMessage(heartbeatMessage);
      
      const heartbeatDataPoint = dataPoints.find(dp => dp.tags.tag === 'heartbeat');
      expect(heartbeatDataPoint).toBeDefined();
      expect(heartbeatDataPoint?.tags).toEqual({
        site: 'china',
        type: 'fleece',
        line: '3',
        equipment_id: 'assembly1_china',
        tag: 'heartbeat'
      });
    });

    it('should validate configuration reload functionality', async () => {
      // Initial load
      const initialConfigs = await lineConfigLoader.loadConfiguration();
      expect(initialConfigs).toHaveLength(5);

      // Add new line configuration
      const newLineConfig: LineConfig = {
        id: 4,
        name: 'URL Line USA',
        site: 'usa',
        type: 'url',
        line: 4,
        equipment: [
          {
            id: 'cutter1_usa',
            name: 'Precision Cutter',
            type: 'cutter',
            status: 'running',
            tags: [
              {
                id: 'blade_speed',
                name: 'Blade Speed',
                dataType: 'REAL',
                value: 1200,
                behavior: {
                  type: 'normal',
                  parameters: { mean: 1200, stddev: 50 }
                }
              }
            ]
          }
        ]
      };

      writeFileSync(
        join(tempConfigDir, 'line4.json'),
        JSON.stringify(newLineConfig, null, 2)
      );

      // Reload configurations
      const reloadedConfigs = await lineConfigLoader.loadConfiguration();
      expect(reloadedConfigs).toHaveLength(6);

      const newEquipment = reloadedConfigs.find(eq => eq.id === 'cutter1_usa');
      expect(newEquipment).toBeDefined();
      expect(newEquipment?.site).toBe('usa');
      expect(newEquipment?.productType).toBe('url');
      expect(newEquipment?.lineNumber).toBe(4);

      // Verify queue discovery picks up new equipment
      const updatedQueueNames = await queueDiscovery.discoverQueueNames();
      expect(updatedQueueNames).toHaveLength(6);
      expect(updatedQueueNames).toContain('plc_data_cutter1_usa');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed line configuration gracefully', async () => {
      writeFileSync(join(tempConfigDir, 'line_malformed.json'), '{ invalid json }');
      
      await expect(lineConfigLoader.loadConfiguration()).rejects.toThrow();
      await expect(queueDiscovery.discoverQueueNames()).rejects.toThrow();
    });

    it('should handle missing equipment tags gracefully', async () => {
      const invalidLineConfig = {
        id: 99,
        name: 'Invalid Line',
        site: 'test',
        type: 'test',
        line: 99,
        equipment: [
          {
            id: 'invalid_equipment',
            name: 'Equipment Without Tags',
            type: 'unknown',
            status: 'unknown'
            // Missing tags array
          }
        ]
      };

      writeFileSync(
        join(tempConfigDir, 'line99.json'),
        JSON.stringify(invalidLineConfig, null, 2)
      );

      await expect(lineConfigLoader.loadConfiguration()).rejects.toThrow();
    });

    it('should handle empty configuration directory', async () => {
      const emptyDir = join(__dirname, 'empty-integration-config');
      mkdirSync(emptyDir, { recursive: true });

      const emptyLineLoader = new LineConfigLoader({
        configDirectory: emptyDir,
        watchForChanges: false
      });

      const emptyQueueDiscovery = new DynamicQueueDiscovery({
        configDirectory: emptyDir
      });

      const emptyConfigs = await emptyLineLoader.loadConfiguration();
      const emptyQueues = await emptyQueueDiscovery.discoverQueueNames();

      expect(emptyConfigs).toHaveLength(0);
      expect(emptyQueues).toHaveLength(0);

      rmSync(emptyDir, { recursive: true, force: true });
    });
  });
});