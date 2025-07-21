import { LineConfigLoader } from '../line-config-loader';
import { EquipmentConfig, LineConfig } from '@factory-dashboard/shared-types';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('LineConfigLoader', () => {
  let tempConfigDir: string;
  let loader: LineConfigLoader;

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
            },
            {
              id: 'door_status',
              name: 'Door Status',
              dataType: 'BOOL',
              value: false,
              behavior: {
                type: 'stepped',
                parameters: { stepValues: [true, false], stepDuration: 100 }
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

    // Write test configuration files
    writeFileSync(join(tempConfigDir, 'line1.json'), JSON.stringify(line1Config, null, 2));
    writeFileSync(join(tempConfigDir, 'line2.json'), JSON.stringify(line2Config, null, 2));

    // Initialize loader
    loader = new LineConfigLoader({
      configDirectory: tempConfigDir,
      watchForChanges: false
    });
  });

  afterEach(() => {
    // Clean up
    loader.stopWatching();
    rmSync(tempConfigDir, { recursive: true, force: true });
  });

  describe('loadConfiguration', () => {
    it('should load equipment configurations from all line files', async () => {
      const equipmentConfigs = await loader.loadConfiguration();

      expect(equipmentConfigs).toHaveLength(3); // 2 from line1, 1 from line2
      
      // Check line1 equipment
      const oven1 = equipmentConfigs.find(eq => eq.id === 'oven1');
      expect(oven1).toBeDefined();
      expect(oven1?.site).toBe('mexico');
      expect(oven1?.productType).toBe('mudguard');
      expect(oven1?.lineNumber).toBe(1);
      expect(oven1?.tags).toHaveLength(2);

      const conveyor1 = equipmentConfigs.find(eq => eq.id === 'conveyor1');
      expect(conveyor1).toBeDefined();
      expect(conveyor1?.site).toBe('mexico');
      expect(conveyor1?.productType).toBe('mudguard');
      expect(conveyor1?.lineNumber).toBe(1);
      expect(conveyor1?.tags).toHaveLength(1);

      // Check line2 equipment
      const press1 = equipmentConfigs.find(eq => eq.id === 'press1');
      expect(press1).toBeDefined();
      expect(press1?.site).toBe('usa');
      expect(press1?.productType).toBe('esm');
      expect(press1?.lineNumber).toBe(2);
      expect(press1?.tags).toHaveLength(1);
    });

    it('should convert tags correctly', async () => {
      const equipmentConfigs = await loader.loadConfiguration();
      const oven1 = equipmentConfigs.find(eq => eq.id === 'oven1');

      expect(oven1?.tags).toHaveLength(2);

      const tempTag = oven1?.tags.find(tag => tag.id === 'temperature');
      expect(tempTag).toBeDefined();
      expect(tempTag?.name).toBe('Temperature Sensor');
      expect(tempTag?.dataType).toBe('REAL');
      expect(tempTag?.equipmentId).toBe('oven1');
      expect(tempTag?.address).toBe('DB1.temperature');
      expect(tempTag?.quality).toBe('GOOD');
      expect(tempTag?.behavior).toEqual({
        type: 'sinusoidal',
        parameters: { min: 300, max: 400, period: 60000 }
      });

      const doorTag = oven1?.tags.find(tag => tag.id === 'door_status');
      expect(doorTag).toBeDefined();
      expect(doorTag?.name).toBe('Door Status');
      expect(doorTag?.dataType).toBe('BOOL');
      expect(doorTag?.behavior).toEqual({
        type: 'stepped',
        parameters: { stepValues: [true, false], stepDuration: 100 }
      });
    });

    it('should generate default states for equipment', async () => {
      const equipmentConfigs = await loader.loadConfiguration();
      const oven1 = equipmentConfigs.find(eq => eq.id === 'oven1');

      expect(oven1?.states).toHaveLength(3);
      expect(oven1?.states.map(s => s.name)).toEqual(['running', 'stopped', 'fault']);
      expect(oven1?.currentState).toBe('running');

      const press1 = equipmentConfigs.find(eq => eq.id === 'press1');
      expect(press1?.currentState).toBe('stopped');
    });

    it('should handle empty config directory', async () => {
      const emptyDir = join(__dirname, 'empty-config');
      mkdirSync(emptyDir, { recursive: true });

      const emptyLoader = new LineConfigLoader({
        configDirectory: emptyDir,
        watchForChanges: false
      });

      const equipmentConfigs = await emptyLoader.loadConfiguration();
      expect(equipmentConfigs).toHaveLength(0);

      rmSync(emptyDir, { recursive: true, force: true });
    });

    it('should handle malformed JSON files', async () => {
      writeFileSync(join(tempConfigDir, 'line3.json'), '{ invalid json }');

      await expect(loader.loadConfiguration()).rejects.toThrow();
    });
  });

  describe('getCurrentConfigs', () => {
    it('should return current configurations', async () => {
      await loader.loadConfiguration();
      const currentConfigs = loader.getCurrentConfigs();

      expect(currentConfigs).toHaveLength(3);
      expect(currentConfigs[0].id).toBeDefined();
    });

    it('should return empty array before loading', () => {
      const currentConfigs = loader.getCurrentConfigs();
      expect(currentConfigs).toHaveLength(0);
    });
  });

  describe('file watching', () => {
    it('should emit configReloaded event when file changes', (done) => {
      const watchLoader = new LineConfigLoader({
        configDirectory: tempConfigDir,
        watchForChanges: true,
        reloadInterval: 100
      });

      watchLoader.on('configReloaded', (newConfigs: EquipmentConfig[]) => {
        expect(newConfigs).toHaveLength(4); // Original 3 + 1 new
        watchLoader.stopWatching();
        done();
      });

      // Load initial configuration
      watchLoader.loadConfiguration().then(() => {
        // Add a new line configuration after a short delay
        setTimeout(() => {
          const newLineConfig: LineConfig = {
            id: 3,
            name: 'Production Line 3',
            site: 'china',
            type: 'fleece',
            line: 3,
            equipment: [
              {
                id: 'assembly1',
                name: 'Assembly Station',
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
              }
            ]
          };

          writeFileSync(join(tempConfigDir, 'line3.json'), JSON.stringify(newLineConfig, null, 2));
        }, 200);
      });
    }, 5000);
  });
});