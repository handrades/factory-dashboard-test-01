/**
 * Secure Configuration Service
 * Provides centralized configuration management using SecretManager
 */

import { secretManager } from '../security/SecretManager';
import { InfluxDBServiceConfig } from './influxdb-service';

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  database?: number;
  maxRetries: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  maxRetriesPerRequest: number;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  sessionTimeout: number;
  maxFailedAttempts: number;
  lockoutDuration: number;
  enableAuthentication: boolean;
}

export interface SecurityConfig {
  allowedOrigins: string[];
  rateLimitWindow: number;
  rateLimitMaxRequests: number;
  enableSecurityHeaders: boolean;
  logSecurityEvents: boolean;
}

export class SecureConfigService {
  private static instance: SecureConfigService;
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): SecureConfigService {
    if (!SecureConfigService.instance) {
      SecureConfigService.instance = new SecureConfigService();
    }
    return SecureConfigService.instance;
  }

  /**
   * Initialize the configuration service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('🔧 Initializing SecureConfigService...');
    
    try {
      await secretManager.initialize();
      this.initialized = true;
      console.log('✅ SecureConfigService initialized successfully');
    } catch {
      console.error('❌ Failed to initialize SecureConfigService:', error);
      throw new Error('SecureConfigService initialization failed');
    }
  }

  /**
   * Get InfluxDB configuration
   */
  public async getInfluxDBConfig(): Promise<InfluxDBServiceConfig> {
    if (!this.initialized) {
      await this.initialize();
    }

    return {
      url: await secretManager.getSecret('INFLUXDB_URL'),
      token: await secretManager.getSecret('INFLUXDB_TOKEN'),
      org: await secretManager.getSecret('INFLUXDB_ORG'),
      bucket: await secretManager.getSecret('INFLUXDB_BUCKET'),
      timeout: parseInt(process.env.INFLUXDB_TIMEOUT || '30000', 10)
    };
  }

  /**
   * Get Redis configuration
   */
  public async getRedisConfig(): Promise<RedisConfig> {
    if (!this.initialized) {
      await this.initialize();
    }

    return {
      host: await secretManager.getSecret('REDIS_HOST'),
      port: parseInt(await secretManager.getSecret('REDIS_PORT'), 10),
      password: await secretManager.getSecret('REDIS_PASSWORD'),
      database: parseInt(process.env.REDIS_DATABASE || '0', 10),
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '5', 10),
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
      enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK !== 'false',
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '3', 10)
    };
  }

  /**
   * Get authentication configuration
   */
  public async getAuthConfig(): Promise<AuthConfig> {
    if (!this.initialized) {
      await this.initialize();
    }

    return {
      jwtSecret: await secretManager.getSecret('JWT_SECRET'),
      jwtRefreshSecret: await secretManager.getSecret('JWT_REFRESH_SECRET'),
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600', 10),
      maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS || '5', 10),
      lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900', 10),
      enableAuthentication: process.env.ENABLE_AUTHENTICATION === 'true'
    };
  }

  /**
   * Get security configuration
   */
  public async getSecurityConfig(): Promise<SecurityConfig> {
    if (!this.initialized) {
      await this.initialize();
    }

    const allowedOriginsStr = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
    
    return {
      allowedOrigins: allowedOriginsStr.split(',').map(origin => origin.trim()),
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900', 10),
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      enableSecurityHeaders: process.env.ENABLE_SECURITY_HEADERS !== 'false',
      logSecurityEvents: process.env.LOG_SECURITY_EVENTS !== 'false'
    };
  }

  /**
   * Get Grafana configuration
   */
  public async getGrafanaConfig(): Promise<{ password: string }> {
    if (!this.initialized) {
      await this.initialize();
    }

    return {
      password: await secretManager.getSecret('GRAFANA_PASSWORD')
    };
  }

  /**
   * Validate all configurations
   */
  public async validateConfigurations(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log('🔍 Validating service configurations...');
      
      // Validate InfluxDB config
      const influxConfig = await this.getInfluxDBConfig();
      if (!influxConfig.url || !influxConfig.token || !influxConfig.org || !influxConfig.bucket) {
        console.error('❌ Invalid InfluxDB configuration');
        return false;
      }

      // Validate Redis config
      const redisConfig = await this.getRedisConfig();
      if (!redisConfig.host || !redisConfig.password || redisConfig.port <= 0) {
        console.error('❌ Invalid Redis configuration');
        return false;
      }

      // Validate Auth config
      const authConfig = await this.getAuthConfig();
      if (!authConfig.jwtSecret || !authConfig.jwtRefreshSecret) {
        console.error('❌ Invalid Authentication configuration');
        return false;
      }

      // Validate Security config
      const securityConfig = await this.getSecurityConfig();
      if (!securityConfig.allowedOrigins || securityConfig.allowedOrigins.length === 0) {
        console.error('❌ Invalid Security configuration');
        return false;
      }

      console.log('✅ All configurations validated successfully');
      return true;
    } catch {
      console.error('❌ Configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Get configuration summary (without sensitive data)
   */
  public async getConfigurationSummary(): Promise<Record<string, unknown>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const influxConfig = await this.getInfluxDBConfig();
    const redisConfig = await this.getRedisConfig();
    const authConfig = await this.getAuthConfig();
    const securityConfig = await this.getSecurityConfig();

    return {
      influxdb: {
        url: influxConfig.url,
        org: influxConfig.org,
        bucket: influxConfig.bucket,
        timeout: influxConfig.timeout,
        tokenConfigured: !!influxConfig.token
      },
      redis: {
        host: redisConfig.host,
        port: redisConfig.port,
        database: redisConfig.database,
        maxRetries: redisConfig.maxRetries,
        passwordConfigured: !!redisConfig.password
      },
      authentication: {
        sessionTimeout: authConfig.sessionTimeout,
        maxFailedAttempts: authConfig.maxFailedAttempts,
        lockoutDuration: authConfig.lockoutDuration,
        enableAuthentication: authConfig.enableAuthentication,
        secretsConfigured: !!(authConfig.jwtSecret && authConfig.jwtRefreshSecret)
      },
      security: {
        allowedOrigins: securityConfig.allowedOrigins,
        rateLimitWindow: securityConfig.rateLimitWindow,
        rateLimitMaxRequests: securityConfig.rateLimitMaxRequests,
        enableSecurityHeaders: securityConfig.enableSecurityHeaders,
        logSecurityEvents: securityConfig.logSecurityEvents
      },
      secretManager: secretManager.getConfiguration()
    };
  }
}

// Export singleton instance
export const secureConfigService = SecureConfigService.getInstance();