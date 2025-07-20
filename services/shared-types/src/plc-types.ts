export interface PLCTag {
  id: string;
  name: string;
  equipmentId: string;
  dataType: 'BOOL' | 'INT' | 'REAL' | 'DINT';
  address: string;
  value: unknown;
  timestamp: Date;
  quality: 'GOOD' | 'BAD' | 'UNCERTAIN';
  behavior?: TagBehavior;
}

export interface TagBehavior {
  type: 'sinusoidal' | 'linear' | 'random' | 'stepped' | 'constant';
  parameters: {
    min?: number;
    max?: number;
    period?: number;
    amplitude?: number;
    offset?: number;
    slope?: number;
    stepValues?: unknown[];
    stepDuration?: number;
    constantValue?: unknown;
  };
}

export interface EquipmentConfig {
  id: string;
  name: string;
  type: 'oven' | 'conveyor' | 'press' | 'assembly' | 'oven-conveyor';
  lineId: string;
  site: string;
  productType: string;
  lineNumber: number;
  tags: PLCTag[];
  states: EquipmentState[];
  currentState: string;
}

export interface EquipmentState {
  name: string;
  description: string;
  tagOverrides: {
    tagId: string;
    value: unknown;
  }[];
  transitions: StateTransition[];
}

export interface StateTransition {
  toState: string;
  condition: string;
  probability?: number;
  delay?: number;
}

export interface LineConfig {
  id: number;
  name: string;
  site: string;
  type: string;
  line: number;
  status: string;
  efficiency: number;
  equipment: {
    id: string;
    name: string;
    type: string;
    status: string;
    tags: {
      id: string;
      name: string;
      dataType: 'BOOL' | 'INT' | 'REAL' | 'DINT';
      value: unknown;
      behavior: TagBehavior;
    }[];
  }[];
}

export interface PLCMessage {
  id: string;
  timestamp: Date;
  equipmentId: string;
  site: string;
  productType: string;
  lineNumber: number;
  tags: {
    tagId: string;
    value: unknown;
    quality: 'GOOD' | 'BAD' | 'UNCERTAIN';
  }[];
  messageType: 'DATA_UPDATE' | 'STATE_CHANGE' | 'ALARM' | 'HEARTBEAT';
}