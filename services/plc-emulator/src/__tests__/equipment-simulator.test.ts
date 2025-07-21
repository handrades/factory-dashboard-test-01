import { EquipmentConfig } from '@factory-dashboard/shared-types';
import { EquipmentSimulator } from '../simulation/equipment-simulator';

describe('EquipmentSimulator', () => {
  const createTestEquipmentConfig = (): EquipmentConfig => ({
    id: 'test_oven',
    name: 'Test Oven',
    type: 'oven',
    lineId: 'test_line',
    site: 'test_factory',
    productType: 'test_product',
    lineNumber: 1,
    currentState: 'running',
    states: [
      {
        name: 'running',
        description: 'Equipment is running',
        tagOverrides: [
          { tagId: 'heating_status', value: true }
        ],
        transitions: [
          { toState: 'stopped', condition: 'manual_stop' }
        ]
      },
      {
        name: 'stopped',
        description: 'Equipment is stopped',
        tagOverrides: [
          { tagId: 'heating_status', value: false },
          { tagId: 'temperature', value: 25 }
        ],
        transitions: [
          { toState: 'running', condition: 'manual_start' }
        ]
      }
    ],
    tags: [
      {
        id: 'temperature',
        name: 'Temperature',
        equipmentId: 'test_oven',
        dataType: 'REAL',
        address: 'DB1.DBD0',
        value: 350,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'sinusoidal',
          parameters: {
            min: 300,
            max: 400,
            period: 60000,
            amplitude: 25,
            offset: 350
          }
        }
      },
      {
        id: 'heating_status',
        name: 'Heating Status',
        equipmentId: 'test_oven',
        dataType: 'BOOL',
        address: 'DB1.DBX4.0',
        value: true,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'constant',
          parameters: {
            constantValue: true
          }
        }
      }
    ]
  });

  let simulator: EquipmentSimulator;

  beforeEach(() => {
    simulator = new EquipmentSimulator(createTestEquipmentConfig());
  });

  describe('generateTagValues', () => {
    it('should generate values for all tags', () => {
      const tagValues = simulator.generateTagValues();
      
      expect(tagValues).toHaveLength(2);
      expect(tagValues.find(t => t.id === 'temperature')).toBeDefined();
      expect(tagValues.find(t => t.id === 'heating_status')).toBeDefined();
    });

    it('should apply state overrides', () => {
      const tagValues = simulator.generateTagValues();
      const heatingStatusTag = tagValues.find(t => t.id === 'heating_status');
      
      expect(heatingStatusTag?.value).toBe(true);
    });

    it('should update timestamps', () => {
      const tagValues = simulator.generateTagValues();
      
      tagValues.forEach(tag => {
        expect(tag.timestamp).toBeInstanceOf(Date);
        expect(tag.timestamp.getTime()).toBeCloseTo(Date.now(), -2);
      });
    });
  });

  describe('state transitions', () => {
    it('should transition to new state when forced', () => {
      expect(simulator.getCurrentState()).toBe('running');
      
      simulator.forceStateTransition('stopped');
      
      expect(simulator.getCurrentState()).toBe('stopped');
    });

    it('should apply new state overrides after transition', () => {
      simulator.forceStateTransition('stopped');
      
      const tagValues = simulator.generateTagValues();
      const heatingStatusTag = tagValues.find(t => t.id === 'heating_status');
      const temperatureTag = tagValues.find(t => t.id === 'temperature');
      
      expect(heatingStatusTag?.value).toBe(false);
      expect(temperatureTag?.value).toBe(25);
    });

    it('should emit state change events', (done) => {
      simulator.on('stateChanged', (event) => {
        expect(event.equipmentId).toBe('test_oven');
        expect(event.previousState).toBe('running');
        expect(event.currentState).toBe('stopped');
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      simulator.forceStateTransition('stopped');
    });
  });

  describe('tag quality simulation', () => {
    it('should mostly generate GOOD quality tags', () => {
      const tagValues = simulator.generateTagValues();
      
      // Most tags should have GOOD quality
      const goodQualityTags = tagValues.filter(t => t.quality === 'GOOD');
      expect(goodQualityTags.length).toBeGreaterThan(0);
    });
  });
});