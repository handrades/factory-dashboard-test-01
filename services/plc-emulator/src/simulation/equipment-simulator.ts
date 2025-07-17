import { EquipmentConfig, EquipmentState, StateTransition, PLCTag } from '@factory-dashboard/shared-types';
import { TagGeneratorFactory, TagGenerator } from '../generators/tag-generators';
import { EventEmitter } from 'events';
import { createLogger } from 'winston';

export class EquipmentSimulator extends EventEmitter {
  private config: EquipmentConfig;
  private currentState: EquipmentState;
  private tagGenerators: Map<string, TagGenerator> = new Map();
  private stateStartTime: number = Date.now();
  private logger: ReturnType<typeof createLogger>;

  constructor(config: EquipmentConfig) {
    super();
    this.config = config;
    this.currentState = this.getStateByName(config.currentState);
    this.logger = createLogger({
      level: 'info',
      format: require('winston').format.json(),
      transports: [
        new (require('winston').transports.Console)()
      ]
    });
    
    this.initializeTagGenerators();
  }

  private initializeTagGenerators(): void {
    for (const tag of this.config.tags) {
      const generator = TagGeneratorFactory.createGenerator(tag);
      this.tagGenerators.set(tag.id, generator);
    }
  }

  private getStateByName(stateName: string): EquipmentState {
    const state = this.config.states.find(s => s.name === stateName);
    if (!state) {
      throw new Error(`State "${stateName}" not found in equipment "${this.config.id}"`);
    }
    return state;
  }

  generateTagValues(): PLCTag[] {
    const generatedTags: PLCTag[] = [];
    
    for (const tag of this.config.tags) {
      const generator = this.tagGenerators.get(tag.id);
      if (!generator) {
        continue;
      }

      let value = generator.generateValue();
      
      // Apply state overrides
      const override = this.currentState.tagOverrides.find(override => override.tagId === tag.id);
      if (override) {
        value = override.value;
      }

      const generatedTag: PLCTag = {
        ...tag,
        value,
        timestamp: new Date(),
        quality: this.getTagQuality(tag)
      };

      generatedTags.push(generatedTag);
    }

    return generatedTags;
  }

  private getTagQuality(tag: PLCTag): 'GOOD' | 'BAD' | 'UNCERTAIN' {
    // Simulate occasional quality issues
    const random = Math.random();
    if (random < 0.001) return 'BAD';
    if (random < 0.01) return 'UNCERTAIN';
    return 'GOOD';
  }

  checkStateTransitions(): void {
    const currentTime = Date.now();
    const stateElapsed = currentTime - this.stateStartTime;

    for (const transition of this.currentState.transitions) {
      if (this.shouldTransition(transition, stateElapsed)) {
        this.transitionToState(transition.toState);
        break;
      }
    }
  }

  private shouldTransition(transition: StateTransition, stateElapsed: number): boolean {
    // Check delay requirement
    if (transition.delay && stateElapsed < transition.delay) {
      return false;
    }

    // Check probability
    if (transition.probability !== undefined) {
      return Math.random() < transition.probability;
    }

    // For now, implement basic condition evaluation
    return this.evaluateCondition(transition.condition);
  }

  private evaluateCondition(condition: string): boolean {
    // Simple condition evaluation - in production this would be more sophisticated
    switch (condition) {
      case 'manual_start':
        return Math.random() < 0.001; // Very low probability of automatic start
      case 'manual_stop':
        return Math.random() < 0.0001; // Very low probability of automatic stop
      case 'temperature_reached':
        const tempTag = this.config.tags.find(t => t.name.toLowerCase().includes('temperature'));
        return tempTag ? (tempTag.value as number) > 300 : false;
      case 'temperature_fault':
        const tempFaultTag = this.config.tags.find(t => t.name.toLowerCase().includes('temperature'));
        return tempFaultTag ? (tempFaultTag.value as number) > 450 : false;
      case 'belt_fault':
        return Math.random() < 0.001; // Random belt fault
      case 'fault_reset':
        return Math.random() < 0.01; // Manual fault reset
      default:
        return false;
    }
  }

  private transitionToState(stateName: string): void {
    const newState = this.getStateByName(stateName);
    const previousState = this.currentState.name;
    
    this.currentState = newState;
    this.stateStartTime = Date.now();
    
    this.logger.info(`Equipment "${this.config.id}" transitioned from "${previousState}" to "${stateName}"`);
    this.emit('stateChanged', {
      equipmentId: this.config.id,
      previousState,
      currentState: stateName,
      timestamp: new Date()
    });
  }

  getCurrentState(): string {
    return this.currentState.name;
  }

  getConfiguration(): EquipmentConfig {
    return { ...this.config };
  }

  forceStateTransition(stateName: string): void {
    this.transitionToState(stateName);
  }
}