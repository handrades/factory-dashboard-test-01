import { PLCTag } from '@factory-dashboard/shared-types';
import { 
  SinusoidalGenerator, 
  LinearGenerator, 
  RandomGenerator, 
  SteppedGenerator, 
  ConstantGenerator,
  TagGeneratorFactory 
} from '../generators/tag-generators';

describe('Tag Generators', () => {
  const createTestTag = (behavior: any): PLCTag => ({
    id: 'test_tag',
    name: 'Test Tag',
    equipmentId: 'test_equipment',
    dataType: 'REAL',
    address: 'DB1.DBD0',
    value: 50,
    timestamp: new Date(),
    quality: 'GOOD',
    behavior
  });

  describe('SinusoidalGenerator', () => {
    it('should generate sinusoidal values within specified range', () => {
      const tag = createTestTag({
        type: 'sinusoidal',
        parameters: {
          min: 0,
          max: 100,
          period: 1000,
          amplitude: 25,
          offset: 50
        }
      });

      const generator = new SinusoidalGenerator(tag);
      
      // Generate multiple values to test range
      for (let i = 0; i < 100; i++) {
        const value = generator.generateValue();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('RandomGenerator', () => {
    it('should generate random values within specified range', () => {
      const tag = createTestTag({
        type: 'random',
        parameters: {
          min: 10,
          max: 90
        }
      });

      const generator = new RandomGenerator(tag);
      
      // Generate multiple values to test range
      for (let i = 0; i < 100; i++) {
        const value = generator.generateValue();
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThanOrEqual(90);
      }
    });
  });

  describe('SteppedGenerator', () => {
    it('should cycle through step values', () => {
      const tag = createTestTag({
        type: 'stepped',
        parameters: {
          stepValues: [10, 20, 30],
          stepDuration: 100
        }
      });

      const generator = new SteppedGenerator(tag);
      
      const firstValue = generator.generateValue();
      expect([10, 20, 30]).toContain(firstValue);
      
      // Wait for step duration and check if value changed
      setTimeout(() => {
        const secondValue = generator.generateValue();
        expect([10, 20, 30]).toContain(secondValue);
      }, 150);
    });
  });

  describe('ConstantGenerator', () => {
    it('should always return the constant value', () => {
      const tag = createTestTag({
        type: 'constant',
        parameters: {
          constantValue: 42
        }
      });

      const generator = new ConstantGenerator(tag);
      
      for (let i = 0; i < 10; i++) {
        expect(generator.generateValue()).toBe(42);
      }
    });
  });

  describe('TagGeneratorFactory', () => {
    it('should create appropriate generator based on behavior type', () => {
      const sinusoidalTag = createTestTag({
        type: 'sinusoidal',
        parameters: { min: 0, max: 100 }
      });

      const randomTag = createTestTag({
        type: 'random',
        parameters: { min: 0, max: 100 }
      });

      const constantTag = createTestTag({
        type: 'constant',
        parameters: { constantValue: 50 }
      });

      expect(TagGeneratorFactory.createGenerator(sinusoidalTag)).toBeInstanceOf(SinusoidalGenerator);
      expect(TagGeneratorFactory.createGenerator(randomTag)).toBeInstanceOf(RandomGenerator);
      expect(TagGeneratorFactory.createGenerator(constantTag)).toBeInstanceOf(ConstantGenerator);
    });
  });
});