import { PLCTag, EquipmentConfig } from '@factory-dashboard/shared-types';

export class OvenTagGenerator {
  static createOvenTags(equipmentId: string): PLCTag[] {
    return [
      {
        id: `${equipmentId}_temperature`,
        name: 'Oven Temperature',
        equipmentId,
        dataType: 'REAL',
        address: `DB${equipmentId}.DBD0`,
        value: 350,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'sinusoidal',
          parameters: {
            min: 300,
            max: 400,
            period: 120000,
            amplitude: 25,
            offset: 350
          }
        }
      },
      {
        id: `${equipmentId}_heating_status`,
        name: 'Heating Status',
        equipmentId,
        dataType: 'BOOL',
        address: `DB${equipmentId}.DBX4.0`,
        value: true,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'constant',
          parameters: {
            constantValue: true
          }
        }
      },
      {
        id: `${equipmentId}_door_status`,
        name: 'Door Status',
        equipmentId,
        dataType: 'BOOL',
        address: `DB${equipmentId}.DBX4.1`,
        value: false,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'constant',
          parameters: {
            constantValue: false
          }
        }
      }
    ];
  }
}

export class ConveyorTagGenerator {
  static createConveyorTags(equipmentId: string): PLCTag[] {
    return [
      {
        id: `${equipmentId}_speed`,
        name: 'Belt Speed',
        equipmentId,
        dataType: 'REAL',
        address: `DB${equipmentId}.DBD0`,
        value: 2.5,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'random',
          parameters: {
            min: 2.0,
            max: 3.0
          }
        }
      },
      {
        id: `${equipmentId}_motor_status`,
        name: 'Motor Status',
        equipmentId,
        dataType: 'BOOL',
        address: `DB${equipmentId}.DBX4.0`,
        value: true,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'constant',
          parameters: {
            constantValue: true
          }
        }
      },
      {
        id: `${equipmentId}_belt_tension`,
        name: 'Belt Tension',
        equipmentId,
        dataType: 'REAL',
        address: `DB${equipmentId}.DBD8`,
        value: 75,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'linear',
          parameters: {
            min: 70,
            max: 80,
            slope: 0.05
          }
        }
      }
    ];
  }
}

export class PressTagGenerator {
  static createPressTags(equipmentId: string): PLCTag[] {
    return [
      {
        id: `${equipmentId}_pressure`,
        name: 'Hydraulic Pressure',
        equipmentId,
        dataType: 'REAL',
        address: `DB${equipmentId}.DBD0`,
        value: 150,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'sinusoidal',
          parameters: {
            min: 100,
            max: 200,
            period: 30000,
            amplitude: 25,
            offset: 150
          }
        }
      },
      {
        id: `${equipmentId}_cycle_count`,
        name: 'Cycle Count',
        equipmentId,
        dataType: 'DINT',
        address: `DB${equipmentId}.DBD4`,
        value: 0,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'stepped',
          parameters: {
            stepValues: [0, 1, 2, 3, 4, 5],
            stepDuration: 5000
          }
        }
      },
      {
        id: `${equipmentId}_position`,
        name: 'Press Position',
        equipmentId,
        dataType: 'REAL',
        address: `DB${equipmentId}.DBD8`,
        value: 0,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'sinusoidal',
          parameters: {
            min: 0,
            max: 100,
            period: 10000,
            amplitude: 50,
            offset: 50
          }
        }
      }
    ];
  }
}

export class AssemblyTableTagGenerator {
  static createAssemblyTableTags(equipmentId: string): PLCTag[] {
    return [
      {
        id: `${equipmentId}_station1_status`,
        name: 'Station 1 Status',
        equipmentId,
        dataType: 'BOOL',
        address: `DB${equipmentId}.DBX0.0`,
        value: true,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'stepped',
          parameters: {
            stepValues: [true, false, true, false],
            stepDuration: 8000
          }
        }
      },
      {
        id: `${equipmentId}_station2_status`,
        name: 'Station 2 Status',
        equipmentId,
        dataType: 'BOOL',
        address: `DB${equipmentId}.DBX0.1`,
        value: false,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'stepped',
          parameters: {
            stepValues: [false, true, false, true],
            stepDuration: 8000
          }
        }
      },
      {
        id: `${equipmentId}_cycle_time`,
        name: 'Cycle Time',
        equipmentId,
        dataType: 'REAL',
        address: `DB${equipmentId}.DBD4`,
        value: 25.5,
        timestamp: new Date(),
        quality: 'GOOD',
        behavior: {
          type: 'random',
          parameters: {
            min: 20.0,
            max: 30.0
          }
        }
      }
    ];
  }
}

export class EquipmentTagFactory {
  static createTagsForEquipment(equipmentConfig: EquipmentConfig): PLCTag[] {
    switch (equipmentConfig.type) {
      case 'oven':
        return OvenTagGenerator.createOvenTags(equipmentConfig.id);
      case 'conveyor':
        return ConveyorTagGenerator.createConveyorTags(equipmentConfig.id);
      case 'press':
        return PressTagGenerator.createPressTags(equipmentConfig.id);
      case 'assembly':
        return AssemblyTableTagGenerator.createAssemblyTableTags(equipmentConfig.id);
      case 'oven-conveyor':
        return [
          ...OvenTagGenerator.createOvenTags(equipmentConfig.id),
          ...ConveyorTagGenerator.createConveyorTags(equipmentConfig.id)
        ];
      default:
        return [];
    }
  }
}