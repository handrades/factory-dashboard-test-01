// Browser-compatible InfluxDB Query Builder
export class InfluxQueryBuilder {
  private allowedFunctions = ['mean', 'sum', 'count', 'min', 'max', 'first', 'last'];
  private allowedMeasurements = [
    'temperature', 'conveyor_speed', 'hydraulic_pressure', 
    'heating_status', 'motor_status', 'message_quality', 'plc_data',
    'door_status', 'cycle_count'
  ];
  private allowedFields = [
    'value', 'enabled', 'open', 'current_state', 'quality_ratio',
    'heartbeat', 'pressure', 'speed', 'temperature'
  ];

  validateIdentifier(identifier: string, allowedValues: string[] | null = null): string {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Identifier must be a non-empty string');
    }

    // Check for injection patterns
    if (this.detectSQLInjection(identifier)) {
      throw new Error('Potential injection detected in identifier');
    }

    // Must contain only alphanumeric characters, underscores, and hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(identifier)) {
      throw new Error('Identifier contains invalid characters');
    }

    // Check against allowed values if provided
    if (allowedValues && !allowedValues.includes(identifier)) {
      throw new Error(`Identifier '${identifier}' not in allowed list`);
    }

    return identifier;
  }

  validateTimeRange(timeRange: string): string {
    if (!timeRange || typeof timeRange !== 'string') {
      throw new Error('Time range must be a non-empty string');
    }

    // Allow either relative time (e.g., "1h", "30m") or ISO dates
    const relativeTimePattern = /^-?\d+[smhd]$/;
    const isRelativeTime = relativeTimePattern.test(timeRange);
    const isISODate = !isNaN(Date.parse(timeRange));

    if (!isRelativeTime && !isISODate) {
      throw new Error('Invalid time range format');
    }

    return timeRange;
  }

  validateBucket(bucket: string): string {
    return this.validateIdentifier(bucket);
  }

  validateEquipmentIds(equipmentIds: string[]): string[] {
    if (!Array.isArray(equipmentIds)) {
      throw new Error('Equipment IDs must be an array');
    }

    if (equipmentIds.length === 0) {
      throw new Error('Equipment IDs array cannot be empty');
    }

    if (equipmentIds.length > 100) {
      throw new Error('Too many equipment IDs (max 100)');
    }

    return equipmentIds.map(id => this.validateIdentifier(id));
  }

  buildEquipmentFilter(equipmentIds: string[]): string {
    const validatedIds = this.validateEquipmentIds(equipmentIds);
    return validatedIds.map(id => `r.equipment_id == "${id}"`).join(' or ');
  }

  buildLatestEquipmentDataQuery(bucket: string, equipmentIds: string[], timeRange: string = '1h'): string {
    const validatedBucket = this.validateBucket(bucket);
    const validatedTimeRange = this.validateTimeRange(timeRange);
    const equipmentFilter = this.buildEquipmentFilter(equipmentIds);

    return `
      from(bucket: "${validatedBucket}")
        |> range(start: -${validatedTimeRange})
        |> filter(fn: (r) => ${equipmentFilter})
        |> group(columns: ["equipment_id", "_measurement", "_field"])
        |> last()
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
    `;
  }

  buildTimeSeriesQuery(
    bucket: string, 
    equipmentId: string, 
    measurement: string, 
    field: string, 
    timeRange: string = '1h', 
    interval: string = '1m', 
    aggregateFunction: string = 'mean'
  ): string {
    const validatedBucket = this.validateBucket(bucket);
    const validatedEquipmentId = this.validateIdentifier(equipmentId);
    const validatedMeasurement = this.validateIdentifier(measurement, this.allowedMeasurements);
    const validatedField = this.validateIdentifier(field, this.allowedFields);
    const validatedTimeRange = this.validateTimeRange(timeRange);
    const validatedInterval = this.validateTimeRange(interval);
    const validatedFunction = this.validateIdentifier(aggregateFunction, this.allowedFunctions);

    return `
      from(bucket: "${validatedBucket}")
        |> range(start: -${validatedTimeRange})
        |> filter(fn: (r) => r.equipment_id == "${validatedEquipmentId}")
        |> filter(fn: (r) => r._measurement == "${validatedMeasurement}")
        |> filter(fn: (r) => r._field == "${validatedField}")
        |> aggregateWindow(every: ${validatedInterval}, fn: ${validatedFunction}, createEmpty: false)
        |> yield(name: "${validatedFunction}")
    `;
  }

  buildEquipmentStatusQuery(bucket: string, equipmentIds: string[], timeRange: string = '10m'): { qualityQuery: string; heartbeatQuery: string } {
    const validatedBucket = this.validateBucket(bucket);
    const validatedTimeRange = this.validateTimeRange(timeRange);
    const equipmentFilter = this.buildEquipmentFilter(equipmentIds);

    const qualityQuery = `
      from(bucket: "${validatedBucket}")
        |> range(start: -${validatedTimeRange})
        |> filter(fn: (r) => ${equipmentFilter})
        |> filter(fn: (r) => r._measurement == "message_quality")
        |> group(columns: ["equipment_id"])
        |> last()
    `;

    const heartbeatQuery = `
      from(bucket: "${validatedBucket}")
        |> range(start: -${validatedTimeRange})
        |> filter(fn: (r) => ${equipmentFilter})
        |> filter(fn: (r) => r._field == "heartbeat")
        |> group(columns: ["equipment_id"])
        |> last()
    `;

    return { qualityQuery, heartbeatQuery };
  }

  buildLineEfficiencyQuery(bucket: string, lineId: string, timeRange: string = '1h'): string {
    const validatedBucket = this.validateBucket(bucket);
    const validatedLineId = this.validateIdentifier(lineId);
    const validatedTimeRange = this.validateTimeRange(timeRange);

    return `
      from(bucket: "${validatedBucket}")
        |> range(start: -${validatedTimeRange})
        |> filter(fn: (r) => r.line_id == "${validatedLineId}")
        |> filter(fn: (r) => r._measurement == "message_quality")
        |> filter(fn: (r) => r._field == "quality_ratio")
        |> mean()
    `;
  }

  buildDataStructureValidationQuery(bucket: string): string {
    const validatedBucket = this.validateBucket(bucket);

    return `
      from(bucket: "${validatedBucket}")
        |> range(start: -1h)
        |> group(columns: ["_measurement", "_field"])
        |> distinct(column: "_measurement")
        |> limit(n: 10)
    `;
  }

  buildConnectionTestQuery(): string {
    return 'buckets() |> limit(n: 1)';
  }

  private detectSQLInjection(input: string): boolean {
    if (typeof input !== 'string') {
      return false;
    }

    // SQL injection patterns
    const sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
      /(\b(UNION|OR|AND)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/gi,
      /(--|\/\*|\*\/|;)/g,
      /(\b(SLEEP|BENCHMARK|WAITFOR)\s*\()/gi,
      /(\b(LOAD_FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b)/gi
    ];

    return sqlInjectionPatterns.some(pattern => pattern.test(input));
  }
}