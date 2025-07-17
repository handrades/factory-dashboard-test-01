export interface InfluxDBConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  timeout: number;
  retentionPolicy?: string;
}

export interface DataPoint {
  measurement: string;
  tags: Record<string, string>;
  fields: Record<string, any>;
  timestamp: Date;
}

export interface QueryResult {
  measurement: string;
  tags: Record<string, string>;
  fields: Record<string, any>;
  timestamp: Date;
}

export interface WriteOptions {
  batchSize: number;
  flushInterval: number;
  retryAttempts: number;
  retryDelay: number;
}