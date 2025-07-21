import { ConfigValidator } from '../config/config-validator';
import { EquipmentConfig } from '@factory-dashboard/shared-types';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('validateEquipment', () => {
    it('should validate a correct equipment configuration', () => {
      const config: EquipmentConfig = {
        id: 'oven1',
        name: 'Industrial Oven',
        type: 'oven',
        lineId: 'line1',
        site: 'test_factory',
        productType: 'test_product',
        lineNumber: 1,
        currentState: 'running',
        states: [
          {
            name: 'running',
            description: 'Equipment is running normally',
            tagOverrides: [
              { tagId: 'temp1', value: 350 }
            ],
            transitions: [
              { toState: 'stopped', condition: 'manual_stop' }
            ]
          },
          {
            name: 'stopped',
            description: 'Equipment is stopped',
            tagOverrides: [
              { tagId: 'temp1', value: 25 }
            ],
            transitions: [
              { toState: 'running', condition: 'manual_start' }
            ]
          }
        ],
        tags: [
          {
            id: 'temp1',
            name: 'Temperature',
            equipmentId: 'oven1',
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
          }
        ]
      };

      const result = validator.validateEquipment(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject config with invalid currentState', () => {
      const config: EquipmentConfig = {
        id: 'oven1',
        name: 'Industrial Oven',
        type: 'oven',
        lineId: 'line1',
        site: 'test_factory',
        productType: 'test_product',
        lineNumber: 1,
        currentState: 'invalid_state',
        states: [
          {
            name: 'running',
            description: 'Equipment is running normally',
            tagOverrides: [],
            transitions: []
          }
        ],
        tags: [
          {
            id: 'temp1',
            name: 'Temperature',
            equipmentId: 'oven1',
            dataType: 'REAL',
            address: 'DB1.DBD0',
            value: 350,
            timestamp: new Date(),
            quality: 'GOOD'
          }
        ]
      };

      const result = validator.validateEquipment(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('currentState "invalid_state" is not defined in states');
    });

    it('should reject config with mismatched tag equipmentId', () => {
      const config: EquipmentConfig = {
        id: 'oven1',
        name: 'Industrial Oven',
        type: 'oven',
        lineId: 'line1',
        site: 'test_factory',
        productType: 'test_product',
        lineNumber: 1,
        currentState: 'running',
        states: [
          {
            name: 'running',
            description: 'Equipment is running normally',
            tagOverrides: [],
            transitions: []
          }
        ],
        tags: [
          {
            id: 'temp1',
            name: 'Temperature',
            equipmentId: 'wrong_id',
            dataType: 'REAL',
            address: 'DB1.DBD0',
            value: 350,
            timestamp: new Date(),
            quality: 'GOOD'
          }
        ]
      };

      const result = validator.validateEquipment(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tag "temp1" has equipmentId "wrong_id" but should be "oven1"');
    });
  });
});