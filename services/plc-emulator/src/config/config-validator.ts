import Ajv, { ValidateFunction } from 'ajv';
import { EquipmentConfig } from '@factory-dashboard/shared-types';
import equipmentConfigSchema from '../schemas/equipment-config.schema.json';

export class ConfigValidator {
  private ajv: Ajv;
  private validateEquipmentConfig: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.validateEquipmentConfig = this.ajv.compile(equipmentConfigSchema);
  }

  validateEquipment(config: unknown): { isValid: boolean; errors: string[] } {
    const isValid = this.validateEquipmentConfig(config) as boolean;
    
    if (!isValid) {
      const validationErrors = (this.validateEquipmentConfig.errors || []).map(error => {
        const instancePath = error.instancePath || '';
        const message = error.message || 'Unknown error';
        return `${instancePath}: ${message}`;
      });
      return { isValid: false, errors: validationErrors };
    }
    
    // If schema validation passed, we can safely cast to EquipmentConfig
    const equipmentConfig = config as EquipmentConfig;
    const customErrors = this.performCustomValidation(equipmentConfig);
    return { 
      isValid: customErrors.length === 0, 
      errors: customErrors 
    };
  }

  private performCustomValidation(config: EquipmentConfig): string[] {
    const errors: string[] = [];

    // Validate that currentState exists in states
    const stateNames = config.states.map(state => state.name);
    if (!stateNames.includes(config.currentState)) {
      errors.push(`currentState "${config.currentState}" is not defined in states`);
    }

    // Validate that tag equipmentId matches equipment id
    for (const tag of config.tags) {
      if (tag.equipmentId !== config.id) {
        errors.push(`Tag "${tag.id}" has equipmentId "${tag.equipmentId}" but should be "${config.id}"`);
      }
    }

    // Validate state transitions point to existing states
    for (const state of config.states) {
      for (const transition of state.transitions) {
        if (!stateNames.includes(transition.toState)) {
          errors.push(`State "${state.name}" has transition to non-existent state "${transition.toState}"`);
        }
      }
    }

    // Validate tag overrides reference existing tags
    const tagIds = config.tags.map(tag => tag.id);
    for (const state of config.states) {
      for (const override of state.tagOverrides) {
        if (!tagIds.includes(override.tagId)) {
          errors.push(`State "${state.name}" has tagOverride for non-existent tag "${override.tagId}"`);
        }
      }
    }

    return errors;
  }
}