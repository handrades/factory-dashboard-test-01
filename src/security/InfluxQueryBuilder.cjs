const { InputValidator } = require('./InputValidator.cjs');

class InfluxQueryBuilder {
  constructor() {
    this.validator = new InputValidator();
    
    // Allowed values for various query parameters
    this.allowedTimeUnits = ['s', 'm', 'h', 'd', 'w'];
    this.allowedFunctions = ['mean', 'sum', 'count', 'min', 'max', 'first', 'last'];
    this.allowedMeasurements = [
      'temperature', 'conveyor_speed', 'hydraulic_pressure', 
      'heating_status', 'motor_status', 'message_quality', 'plc_data',
      'door_status', 'cycle_count'
    ];
    this.allowedFields = [
      'value', 'enabled', 'open', 'current_state', 'quality_ratio',
      'heartbeat', 'pressure', 'speed', 'temperature'
    ];
    this.allowedColumns = [
      'equipment_id', 'line_id', '_measurement', '_field', '_time', '_value'
    ];
  }

  validateIdentifier(identifier, allowedValues = null) {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Identifier must be a non-empty string');
    }

    // Check for injection patterns
    if (this.validator.detectSQLInjection(identifier)) {
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

  validateTimeRange(timeRange) {
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

  validateBucket(bucket) {
    return this.validateIdentifier(bucket);
  }

  validateEquipmentIds(equipmentIds) {
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

  buildEquipmentFilter(equipmentIds) {
    const validatedIds = this.validateEquipmentIds(equipmentIds);
    return validatedIds.map(id => `r.equipment_id == "${id}"`).join(' or ');
  }

  buildLatestEquipmentDataQuery(bucket, equipmentIds, timeRange = '1h') {
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

  buildTimeSeriesQuery(bucket, equipmentId, measurement, field, timeRange = '1h', interval = '1m', aggregateFunction = 'mean') {
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

  buildEquipmentStatusQuery(bucket, equipmentIds, timeRange = '10m') {
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

  buildLineEfficiencyQuery(bucket, lineId, timeRange = '1h') {
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

  buildDataStructureValidationQuery(bucket) {
    const validatedBucket = this.validateBucket(bucket);

    return `
      from(bucket: "${validatedBucket}")
        |> range(start: -1h)
        |> group(columns: ["_measurement", "_field"])
        |> distinct(column: "_measurement")
        |> limit(n: 10)
    `;
  }

  buildConnectionTestQuery() {
    return 'buckets() |> limit(n: 1)';
  }

  // Method to validate complete query strings if needed
  validateQuery(query) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    // Check for dangerous patterns
    if (this.validator.detectSQLInjection(query)) {
      throw new Error('Potential injection detected in query');
    }

    // Additional InfluxDB-specific checks
    const dangerousPatterns = [
      /import\s+/gi,          // Import statements
      /option\s+/gi,          // Option statements that could change settings
      /to\s+/gi,              // Write operations
      /delete\s+/gi,          // Delete operations
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new Error('Query contains potentially dangerous operations');
      }
    }

    return query;
  }

  // Utility method for building custom filters with validation
  buildCustomFilter(column, operator, value) {
    const validatedColumn = this.validateIdentifier(column, this.allowedColumns);
    
    // Validate operator
    const allowedOperators = ['==', '!=', '>', '<', '>=', '<=', '=~', '!~'];
    if (!allowedOperators.includes(operator)) {
      throw new Error(`Invalid operator: ${operator}`);
    }

    // Validate and escape value based on type
    let escapedValue;
    if (typeof value === 'string') {
      // Escape quotes and validate for injection
      if (this.validator.detectSQLInjection(value)) {
        throw new Error('Potential injection detected in filter value');
      }
      escapedValue = `"${value.replace(/"/g, '\\"')}"`;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Invalid numeric value');
      }
      escapedValue = value.toString();
    } else if (typeof value === 'boolean') {
      escapedValue = value.toString();
    } else {
      throw new Error('Unsupported value type for filter');
    }

    return `r.${validatedColumn} ${operator} ${escapedValue}`;
  }

  // Method to safely combine multiple filters
  buildMultipleFilters(filters, logicalOperator = 'and') {
    if (!Array.isArray(filters) || filters.length === 0) {
      throw new Error('Filters must be a non-empty array');
    }

    if (!['and', 'or'].includes(logicalOperator)) {
      throw new Error('Logical operator must be "and" or "or"');
    }

    // Validate each filter
    const validatedFilters = filters.map(filter => {
      if (typeof filter === 'string') {
        return filter;
      } else if (typeof filter === 'object' && filter.column && filter.operator && filter.value !== undefined) {
        return this.buildCustomFilter(filter.column, filter.operator, filter.value);
      } else {
        throw new Error('Invalid filter format');
      }
    });

    return validatedFilters.join(` ${logicalOperator} `);
  }
}

module.exports = InfluxQueryBuilder;