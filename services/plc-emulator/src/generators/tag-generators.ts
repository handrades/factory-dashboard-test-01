import { PLCTag, TagBehavior } from '@factory-dashboard/shared-types';

export abstract class TagGenerator {
  protected tag: PLCTag;
  protected behavior: TagBehavior;
  protected startTime: number;

  constructor(tag: PLCTag) {
    this.tag = tag;
    this.behavior = tag.behavior || { type: 'constant', parameters: { constantValue: tag.value } };
    this.startTime = Date.now();
  }

  abstract generateValue(): any;

  protected getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  protected clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}

export class SinusoidalGenerator extends TagGenerator {
  generateValue(): number {
    const { min = 0, max = 100, period = 60000, amplitude = 50, offset = 50 } = this.behavior.parameters;
    const elapsedTime = this.getElapsedTime();
    const phase = (elapsedTime % period) / period * 2 * Math.PI;
    const value = offset + amplitude * Math.sin(phase);
    return this.clamp(value, min, max);
  }
}

export class LinearGenerator extends TagGenerator {
  generateValue(): number {
    const { min = 0, max = 100, slope = 1 } = this.behavior.parameters;
    const elapsedTime = this.getElapsedTime();
    const value = (this.tag.value as number) + slope * (elapsedTime / 1000);
    return this.clamp(value, min, max);
  }
}

export class RandomGenerator extends TagGenerator {
  generateValue(): number {
    const { min = 0, max = 100 } = this.behavior.parameters;
    return min + Math.random() * (max - min);
  }
}

export class SteppedGenerator extends TagGenerator {
  private currentStepIndex: number = 0;
  private stepStartTime: number = Date.now();

  generateValue(): any {
    const { stepValues = [0, 50, 100], stepDuration = 10000 } = this.behavior.parameters;
    const elapsedTime = this.getElapsedTime();
    
    if (elapsedTime - this.stepStartTime >= stepDuration) {
      this.currentStepIndex = (this.currentStepIndex + 1) % stepValues.length;
      this.stepStartTime = elapsedTime;
    }
    
    return stepValues[this.currentStepIndex];
  }
}

export class ConstantGenerator extends TagGenerator {
  generateValue(): any {
    return this.behavior.parameters.constantValue ?? this.tag.value;
  }
}

export class TagGeneratorFactory {
  static createGenerator(tag: PLCTag): TagGenerator {
    const behavior = tag.behavior || { type: 'constant', parameters: { constantValue: tag.value } };
    
    switch (behavior.type) {
      case 'sinusoidal':
        return new SinusoidalGenerator(tag);
      case 'linear':
        return new LinearGenerator(tag);
      case 'random':
        return new RandomGenerator(tag);
      case 'stepped':
        return new SteppedGenerator(tag);
      case 'constant':
      default:
        return new ConstantGenerator(tag);
    }
  }
}