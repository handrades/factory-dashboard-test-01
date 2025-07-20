const joi = require('joi');
const dompurify = require('isomorphic-dompurify');

class InputValidator {
  constructor() {
    this.schemas = {
      // User authentication schemas
      loginRequest: joi.object({
        username: joi.string().alphanum().min(3).max(30).required(),
        password: joi.string().min(8).max(128).required()
      }),

      registerRequest: joi.object({
        username: joi.string().alphanum().min(3).max(30).required(),
        email: joi.string().email().required(),
        password: joi.string().min(8).max(128).required(),
        roles: joi.array().items(joi.string().valid('admin', 'operator', 'viewer')).optional()
      }),

      changePassword: joi.object({
        currentPassword: joi.string().min(8).max(128).required(),
        newPassword: joi.string().min(8).max(128).required()
      }),

      // Equipment and sensor data schemas
      plcMessage: joi.object({
        id: joi.string().uuid().required(),
        timestamp: joi.date().required(),
        equipmentId: joi.string().alphanum().min(1).max(50).required(),
        messageType: joi.string().valid('DATA_UPDATE', 'ALARM', 'STATUS_CHANGE').required(),
        tags: joi.array().items(
          joi.object({
            tagId: joi.string().alphanum().min(1).max(50).required(),
            value: joi.alternatives().try(joi.number(), joi.string().max(255), joi.boolean()).required(),
            quality: joi.string().valid('GOOD', 'BAD', 'UNCERTAIN').required()
          })
        ).min(1).required()
      }),

      // InfluxDB query schemas
      influxQuery: joi.object({
        bucket: joi.string().alphanum().min(1).max(100).required(),
        range: joi.object({
          start: joi.alternatives().try(joi.date(), joi.string().pattern(/^-?\d+[smhd]$/)).required(),
          stop: joi.alternatives().try(joi.date(), joi.string().pattern(/^-?\d+[smhd]$/)).optional()
        }).required(),
        measurement: joi.string().alphanum().min(1).max(100).optional(),
        field: joi.string().alphanum().min(1).max(100).optional(),
        filters: joi.object().pattern(joi.string(), joi.string()).optional()
      }),

      // File operations schemas
      fileOperation: joi.object({
        filename: joi.string().pattern(/^[a-zA-Z0-9._-]+$/).min(1).max(255).required(),
        path: joi.string().pattern(/^[a-zA-Z0-9\/._-]+$/).max(1000).optional(),
        operation: joi.string().valid('read', 'write', 'delete', 'list').required()
      }),

      // API request schemas
      apiRequest: joi.object({
        endpoint: joi.string().uri({ relativeOnly: true }).required(),
        method: joi.string().valid('GET', 'POST', 'PUT', 'DELETE', 'PATCH').required(),
        headers: joi.object().pattern(joi.string(), joi.string()).optional(),
        queryParams: joi.object().pattern(joi.string(), joi.alternatives().try(joi.string(), joi.number(), joi.boolean())).optional()
      }),

      // Configuration schemas
      serviceConfig: joi.object({
        service: joi.string().valid('plc-emulator', 'queue-consumer', 'auth-service').required(),
        environment: joi.string().valid('development', 'staging', 'production').required(),
        port: joi.number().port().optional(),
        host: joi.string().hostname().optional(),
        logLevel: joi.string().valid('error', 'warn', 'info', 'debug').optional()
      })
    };

    // XSS patterns to detect
    this.xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi
    ];

    // SQL injection patterns
    this.sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
      /(\b(UNION|OR|AND)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/gi,
      /(--|\/\*|\*\/|;)/g,
      /(\b(SLEEP|BENCHMARK|WAITFOR)\s*\()/gi,
      /(\b(LOAD_FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b)/gi
    ];

    // Path traversal patterns
    this.pathTraversalPatterns = [
      /\.\.\//g,
      /\.\.\\g,
      /%2e%2e%2f/gi,
      /%2e%2e%5c/gi,
      /\.\.%2f/gi,
      /\.\.%5c/gi
    ];
  }

  validate(schema, data) {
    if (typeof schema === 'string') {
      schema = this.schemas[schema];
    }

    if (!schema) {
      throw new Error('Invalid schema specified');
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      throw new ValidationError('Input validation failed', details);
    }

    return value;
  }

  sanitizeHtml(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return dompurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  }

  detectXSS(input) {
    if (typeof input !== 'string') {
      return false;
    }

    return this.xssPatterns.some(pattern => pattern.test(input));
  }

  detectSQLInjection(input) {
    if (typeof input !== 'string') {
      return false;
    }

    return this.sqlInjectionPatterns.some(pattern => pattern.test(input));
  }

  detectPathTraversal(input) {
    if (typeof input !== 'string') {
      return false;
    }

    return this.pathTraversalPatterns.some(pattern => pattern.test(input));
  }

  sanitizeInput(input, options = {}) {
    if (typeof input !== 'string') {
      return input;
    }

    let sanitized = input;

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Handle XSS
    if (options.preventXSS !== false) {
      if (this.detectXSS(sanitized)) {
        throw new SecurityError('Potential XSS attack detected', { input: this.maskSensitiveInput(input) });
      }
      sanitized = this.sanitizeHtml(sanitized);
    }

    // Handle SQL injection
    if (options.preventSQLInjection !== false) {
      if (this.detectSQLInjection(sanitized)) {
        throw new SecurityError('Potential SQL injection detected', { input: this.maskSensitiveInput(input) });
      }
    }

    // Handle path traversal
    if (options.preventPathTraversal !== false) {
      if (this.detectPathTraversal(sanitized)) {
        throw new SecurityError('Potential path traversal detected', { input: this.maskSensitiveInput(input) });
      }
    }

    // Trim whitespace
    if (options.trim !== false) {
      sanitized = sanitized.trim();
    }

    // Limit length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    return sanitized;
  }

  validateAndSanitizeObject(obj, schemaName, sanitizeOptions = {}) {
    if (!obj || typeof obj !== 'object') {
      throw new ValidationError('Input must be an object');
    }

    // First validate the structure
    const validated = this.validate(schemaName, obj);

    // Then sanitize string values
    return this.deepSanitize(validated, sanitizeOptions);
  }

  deepSanitize(obj, options = {}) {
    if (typeof obj === 'string') {
      return this.sanitizeInput(obj, options);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitize(item, options));
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.deepSanitize(value, options);
      }
      return sanitized;
    }

    return obj;
  }

  validateFileName(filename) {
    // Check for null or empty
    if (!filename || typeof filename !== 'string') {
      throw new ValidationError('Filename is required and must be a string');
    }

    // Check length
    if (filename.length > 255) {
      throw new ValidationError('Filename too long (max 255 characters)');
    }

    // Check for invalid characters
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(filename)) {
      throw new ValidationError('Filename contains invalid characters');
    }

    // Check for reserved names (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(filename)) {
      throw new ValidationError('Filename uses reserved name');
    }

    // Check for path traversal
    if (this.detectPathTraversal(filename)) {
      throw new SecurityError('Potential path traversal in filename');
    }

    return true;
  }

  validateIPAddress(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  validatePort(port) {
    const portNum = parseInt(port, 10);
    return Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
  }

  maskSensitiveInput(input, maskChar = '*', showLength = 4) {
    if (typeof input !== 'string' || input.length <= showLength) {
      return maskChar.repeat(8);
    }

    const start = input.substring(0, Math.floor(showLength / 2));
    const end = input.substring(input.length - Math.floor(showLength / 2));
    const middle = maskChar.repeat(Math.max(8, input.length - showLength));

    return start + middle + end;
  }

  createMiddleware() {
    return (req, res, next) => {
      // Add validation methods to request object
      req.validate = (schema, data = req.body) => {
        return this.validate(schema, data);
      };

      req.sanitize = (input, options) => {
        return this.sanitizeInput(input, options);
      };

      req.validateAndSanitize = (schema, data = req.body, options) => {
        return this.validateAndSanitizeObject(data, schema, options);
      };

      next();
    };
  }
}

class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    this.statusCode = 400;
  }
}

class SecurityError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'SecurityError';
    this.context = context;
    this.statusCode = 403;
  }
}

module.exports = {
  InputValidator,
  ValidationError,
  SecurityError
};