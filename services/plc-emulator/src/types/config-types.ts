import { EquipmentConfig } from '@factory-dashboard/shared-types';

export interface ConfigurationFile {
  equipment: EquipmentConfig[];
  metadata?: {
    version: string;
    created: string;
    updated: string;
    description?: string;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ConfigurationStats {
  totalEquipment: number;
  totalTags: number;
  equipmentByType: Record<string, number>;
  tagsPerEquipment: Record<string, number>;
}