import { DynamicQueueDiscovery } from '../dynamic-queue-discovery';
import { LineConfig } from '@factory-dashboard/shared-types';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('DynamicQueueDiscovery', () => {
  let tempConfigDir: string;
  let discovery: DynamicQueueDiscovery;

  beforeEach(() => {
    // Create temporary config directory
    tempConfigDir = join(__dirname, 'temp-config');
    mkdirSync(tempConfigDir, { recursive: true });

    // Create test line configurations
    const line1Config: LineConfig = {
      id: 1,
      name: 'Production Line 1',
      site: 'mexico',
      type: 'mudguard',
      line: 1,
      status: 'running',
      efficiency: 85.5,
      equipment: [
        {
          id: 'oven1',
          name: 'Primary Oven',
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
            }
          ]
        },
        {
          id: 'conveyor1',
          name: 'Main Conveyor',
          type: 'conveyor',
          status: 'running',
          tags: [
            {
              id: 'speed',
              name: 'Belt Speed',
              dataType: 'REAL',
              value: 2.5,
              behavior: {
                type: 'random',
                parameters: { min: 2.4, max: 2.6 }
              }
            }
          ]
        }
      ]
    };

    const line2Config: LineConfig = {
      id: 2,
      name: 'Production Line 2',
      site: 'usa',
      type: 'esm',
      line: 2,
      status: 'running',
      efficiency: 92.3,
      equipment: [
        {
          id: 'press1',
          name: 'Hydraulic Press',
          type: 'press',
          status: 'stopped',
          tags: [
            {
              id: 'pressure',
              name: 'Hydraulic Pressure',
              dataType: 'REAL',
              value: 0,
              behavior: {
                type: 'constant',
                parameters: { constantValue: 0 }
              }
            }
          ]
        }
      ]
    };

    const line3Config: LineConfig = {
      id: 3,
      name: 'Production Line 3',
      site: 'china',
      type: 'fleece',
      line: 3,
      status: 'running',
      efficiency: 78.9,
      equipment: [
        {
          id: 'assembly1',
          name: 'Assembly Station 1',
          type: 'assembly',
          status: 'running',
          tags: [
            {
              id: 'cycle_time',
              name: 'Cycle Time',
              dataType: 'REAL',
              value: 45,
              behavior: {
                type: 'random',
                parameters: { min: 40, max: 50 }
              }
            }
          ]
        },
        {
          id: 'assembly2',
          name: 'Assembly Station 2',
          type: 'assembly',
          status: 'running',
          tags: [
            {
              id: 'cycle_time',
              name: 'Cycle Time',
              dataType: 'REAL',
              value: 50,
              behavior: {
                type: 'random',
                parameters: { min: 45, max: 55 }
              }
            }
          ]
        }
      ]
    };

    // Write test configuration files
    writeFileSync(join(tempConfigDir, 'line1.json'), JSON.stringify(line1Config, null, 2));
    writeFileSync(join(tempConfigDir, 'line2.json'), JSON.stringify(line2Config, null, 2));
    writeFileSync(join(tempConfigDir, 'line3.json'), JSON.stringify(line3Config, null, 2));

    // Initialize discovery
    discovery = new DynamicQueueDiscovery({
      configDirectory: tempConfigDir,
      queueNamePrefix: 'plc_data_'
    });
  });

  afterEach(() => {
    // Clean up
    rmSync(tempConfigDir, { recursive: true, force: true });
  });

  describe('discoverQueueNames', () => {
    it('should discover queue names from all line configurations', async () => {
      const queueNames = await discovery.discoverQueueNames();

      expect(queueNames).toHaveLength(5); // 2 from line1, 1 from line2, 2 from line3
      expect(queueNames).toContain('plc_data_oven1');
      expect(queueNames).toContain('plc_data_conveyor1');
      expect(queueNames).toContain('plc_data_press1');
      expect(queueNames).toContain('plc_data_assembly1');
      expect(queueNames).toContain('plc_data_assembly2');
    });

    it('should use custom queue prefix', async () => {
      const customDiscovery = new DynamicQueueDiscovery({
        configDirectory: tempConfigDir,
        queueNamePrefix: 'custom_'
      });

      const queueNames = await customDiscovery.discoverQueueNames();

      expect(queueNames).toHaveLength(5);
      expect(queueNames).toContain('custom_oven1');
      expect(queueNames).toContain('custom_conveyor1');
      expect(queueNames).toContain('custom_press1');
      expect(queueNames).toContain('custom_assembly1');
      expect(queueNames).toContain('custom_assembly2');
    });

    it('should handle empty config directory', async () => {
      const emptyDir = join(__dirname, 'empty-config');
      mkdirSync(emptyDir, { recursive: true });

      const emptyDiscovery = new DynamicQueueDiscovery({
        configDirectory: emptyDir
      });

      const queueNames = await emptyDiscovery.discoverQueueNames();
      expect(queueNames).toHaveLength(0);

      rmSync(emptyDir, { recursive: true, force: true });
    });

    it('should handle malformed JSON files', async () => {
      writeFileSync(join(tempConfigDir, 'line4.json'), '{ invalid json }');

      await expect(discovery.discoverQueueNames()).rejects.toThrow();
    });

    it('should ignore non-line JSON files', async () => {
      const otherConfig = { some: 'config' };
      writeFileSync(join(tempConfigDir, 'other.json'), JSON.stringify(otherConfig));
      writeFileSync(join(tempConfigDir, 'config.json'), JSON.stringify(otherConfig));

      const queueNames = await discovery.discoverQueueNames();
      expect(queueNames).toHaveLength(5); // Should still be 5, ignoring other files
    });
  });

  describe('getEquipmentSummary', () => {
    it('should provide comprehensive equipment summary', async () => {
      const summary = await discovery.getEquipmentSummary();

      expect(summary.totalEquipment).toBe(5);

      // Check equipment by line
      expect(summary.equipmentByLine).toEqual({
        'line1': ['oven1', 'conveyor1'],
        'line2': ['press1'],
        'line3': ['assembly1', 'assembly2']
      });

      // Check equipment by site
      expect(summary.equipmentBySite).toEqual({
        'mexico': ['oven1', 'conveyor1'],
        'usa': ['press1'],
        'china': ['assembly1', 'assembly2']
      });

      // Check equipment by type
      expect(summary.equipmentByType).toEqual({
        'mudguard': ['oven1', 'conveyor1'],
        'esm': ['press1'],
        'fleece': ['assembly1', 'assembly2']
      });
    });

    it('should handle equipment across multiple sites with same type', async () => {
      // Add another line with same product type but different site
      const line4Config: LineConfig = {
        id: 4,
        name: 'Production Line 4',
        site: 'usa',
        type: 'mudguard', // Same type as line1 but different site
        line: 4,
        status: 'running',
        efficiency: 88.7,
        equipment: [
          {
            id: 'oven2',
            name: 'Secondary Oven',
            type: 'oven',
            status: 'running',
            tags: [
              {
                id: 'temperature',
                name: 'Temperature Sensor',
                dataType: 'REAL',
                value: 320,
                behavior: {
                  type: 'constant',
                  parameters: { constantValue: 320 }
                }
              }
            ]
          }
        ]
      };

      writeFileSync(join(tempConfigDir, 'line4.json'), JSON.stringify(line4Config, null, 2));

      const summary = await discovery.getEquipmentSummary();

      expect(summary.totalEquipment).toBe(6);
      expect(summary.equipmentBySite['usa']).toEqual(['press1', 'oven2']);
      expect(summary.equipmentByType['mudguard']).toEqual(['oven1', 'conveyor1', 'oven2']);
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent config directory', async () => {
      const invalidDiscovery = new DynamicQueueDiscovery({
        configDirectory: '/non/existent/path'
      });

      await expect(invalidDiscovery.discoverQueueNames()).rejects.toThrow();
    });

    it('should handle line config without equipment array', async () => {
      const invalidLineConfig = {
        id: 99,
        name: 'Invalid Line',
        site: 'test',
        type: 'test',
        line: 99
        // Missing equipment array
      };

      writeFileSync(join(tempConfigDir, 'line99.json'), JSON.stringify(invalidLineConfig, null, 2));

      await expect(discovery.discoverQueueNames()).rejects.toThrow();
    });
  });
});