/**
 * Secure Secrets Management System
 * Provides centralized, secure credential management across all environments
 */

export interface SecretConfig {
  source: 'env' | 'docker_secret' | 'external';
  key: string;
  required: boolean;
  masked: boolean;
  defaultValue?: string;
}

export interface SecretsConfiguration {
  environment: string;
  secrets: Record<string, SecretConfig>;
}

export class SecretManager {
  private static instance: SecretManager;
  private secrets: Map<string, string> = new Map();
  private configuration: SecretsConfiguration;
  private initialized: boolean = false;

  private constructor() {
    this.configuration = this.loadConfiguration();
  }

  public static getInstance(): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager();
    }
    return SecretManager.instance;
  }

  /**
   * Initialize the secrets manager and load all configured secrets
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('🔐 Initializing SecretManager...');
    
    try {
      await this.loadAllSecrets();
      await this.validateRequiredSecrets();
      this.initialized = true;
      console.log('✅ SecretManager initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize SecretManager:', error);
      throw new Error('SecretManager initialization failed');
    }
  }

  /**
   * Get a secret value by key
   */
  public async getSecret(key: string, _environment?: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const secretValue = this.secrets.get(key);
    if (!secretValue) {
      const config = this.configuration.secrets[key];
      if (config?.required) {
        throw new Error(`Required secret '${key}' not found`);
      }
      return config?.defaultValue || '';
    }

    return secretValue;
  }

  /**
   * Get a secret synchronously (for already loaded secrets)
   */
  public getSecretSync(key: string): string {
    if (!this.initialized) {
      throw new Error('SecretManager not initialized. Call initialize() first.');
    }

    const secretValue = this.secrets.get(key);
    if (!secretValue) {
      const config = this.configuration.secrets[key];
      if (config?.required) {
        throw new Error(`Required secret '${key}' not found`);
      }
      return config?.defaultValue || '';
    }

    return secretValue;
  }

  /**
   * Validate that all required secrets are available
   */
  public async validateSecrets(): Promise<boolean> {
    const requiredSecrets = Object.entries(this.configuration.secrets)
      .filter(([, config]) => config.required)
      .map(([key]) => key);

    const missingSecrets: string[] = [];

    for (const secretKey of requiredSecrets) {
      try {
        const value = await this.getSecret(secretKey);
        if (!value) {
          missingSecrets.push(secretKey);
        }
      } catch {
        missingSecrets.push(secretKey);
      }
    }

    if (missingSecrets.length > 0) {
      console.error('❌ Missing required secrets:', missingSecrets);
      return false;
    }

    return true;
  }

  /**
   * Mask sensitive data in logs and error messages
   */
  public maskSensitiveData(data: unknown): unknown {
    if (typeof data === 'string') {
      return this.maskString(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const masked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isSensitiveKey(key)) {
          masked[key] = this.maskString(String(value));
        } else {
          masked[key] = this.maskSensitiveData(value);
        }
      }
      return masked;
    }

    return data;
  }

  /**
   * Rotate a secret (for future implementation with external secret managers)
   */
  public async rotateSecret(key: string): Promise<void> {
    // This would integrate with external secret management systems
    // For now, it's a placeholder for future implementation
    console.log(`🔄 Secret rotation requested for: ${key}`);
    throw new Error('Secret rotation not yet implemented');
  }

  /**
   * Get configuration information (without sensitive values)
   */
  public getConfiguration(): Omit<SecretsConfiguration, 'secrets'> & {
    secretCount: number;
    requiredSecrets: string[];
    loadedSecrets: string[];
  } {
    const requiredSecrets = Object.entries(this.configuration.secrets)
      .filter(([, config]) => config.required)
      .map(([key]) => key);

    const loadedSecrets = Array.from(this.secrets.keys());

    return {
      environment: this.configuration.environment,
      secretCount: Object.keys(this.configuration.secrets).length,
      requiredSecrets,
      loadedSecrets
    };
  }

  private loadConfiguration(): SecretsConfiguration {
    const environment = process.env.NODE_ENV || 'development';
    
    return {
      environment,
      secrets: {
        // Redis Configuration
        REDIS_PASSWORD: {
          source: 'env',
          key: 'REDIS_PASSWORD',
          required: true,
          masked: true
        },
        REDIS_HOST: {
          source: 'env',
          key: 'REDIS_HOST',
          required: false,
          masked: false,
          defaultValue: 'localhost'
        },
        REDIS_PORT: {
          source: 'env',
          key: 'REDIS_PORT',
          required: false,
          masked: false,
          defaultValue: '6379'
        },

        // InfluxDB Configuration
        INFLUXDB_URL: {
          source: 'env',
          key: 'INFLUXDB_URL',
          required: false,
          masked: false,
          defaultValue: 'http://localhost:8086'
        },
        INFLUXDB_TOKEN: {
          source: 'env',
          key: 'INFLUXDB_TOKEN',
          required: true,
          masked: true
        },
        INFLUXDB_ORG: {
          source: 'env',
          key: 'INFLUXDB_ORG',
          required: true,
          masked: false
        },
        INFLUXDB_BUCKET: {
          source: 'env',
          key: 'INFLUXDB_BUCKET',
          required: true,
          masked: false
        },
        INFLUXDB_USERNAME: {
          source: 'env',
          key: 'INFLUXDB_USERNAME',
          required: false,
          masked: false,
          defaultValue: 'admin'
        },
        INFLUXDB_PASSWORD: {
          source: 'env',
          key: 'INFLUXDB_PASSWORD',
          required: true,
          masked: true
        },

        // Authentication Configuration
        JWT_SECRET: {
          source: 'env',
          key: 'JWT_SECRET',
          required: true,
          masked: true
        },
        JWT_REFRESH_SECRET: {
          source: 'env',
          key: 'JWT_REFRESH_SECRET',
          required: true,
          masked: true
        },

        // Grafana Configuration
        GRAFANA_PASSWORD: {
          source: 'env',
          key: 'GRAFANA_PASSWORD',
          required: true,
          masked: true
        }
      }
    };
  }

  private async loadAllSecrets(): Promise<void> {
    const loadPromises = Object.entries(this.configuration.secrets).map(
      async ([key, config]) => {
        try {
          const value = await this.loadSecret(config);
          if (value) {
            this.secrets.set(key, value);
          }
        } catch (error) {
          if (config.required) {
            throw new Error(`Failed to load required secret '${key}': ${error}`);
          }
          console.warn(`⚠️  Failed to load optional secret '${key}':`, error);
        }
      }
    );

    await Promise.all(loadPromises);
  }

  private async loadSecret(config: SecretConfig): Promise<string | undefined> {
    switch (config.source) {
      case 'env':
        return process.env[config.key] || config.defaultValue;
      
      case 'docker_secret':
        return await this.loadDockerSecret(config.key);
      
      case 'external':
        return await this.loadExternalSecret(config.key);
      
      default:
        throw new Error(`Unknown secret source: ${config.source}`);
    }
  }

  private async loadDockerSecret(secretName: string): Promise<string | undefined> {
    try {
      const fs = await import('fs/promises');
      const secretPath = `/run/secrets/${secretName}`;
      const secretValue = await fs.readFile(secretPath, 'utf8');
      return secretValue.trim();
    } catch (error) {
      console.warn(`⚠️  Failed to load Docker secret '${secretName}':`, error);
      return undefined;
    }
  }

  private async loadExternalSecret(secretName: string): Promise<string | undefined> {
    // Placeholder for external secret management integration
    // This would integrate with services like HashiCorp Vault, AWS Secrets Manager, etc.
    console.warn(`⚠️  External secret loading not implemented for: ${secretName}`);
    return undefined;
  }

  private async validateRequiredSecrets(): Promise<void> {
    const requiredSecrets = Object.entries(this.configuration.secrets)
      .filter(([, config]) => config.required)
      .map(([key]) => key);

    const missingSecrets: string[] = [];

    for (const secretKey of requiredSecrets) {
      if (!this.secrets.has(secretKey)) {
        missingSecrets.push(secretKey);
      }
    }

    if (missingSecrets.length > 0) {
      throw new Error(`Missing required secrets: ${missingSecrets.join(', ')}`);
    }
  }

  private maskString(value: string): string {
    if (!value || value.length <= 4) {
      return '***';
    }
    
    const visibleChars = Math.min(4, Math.floor(value.length * 0.2));
    const maskedLength = value.length - visibleChars;
    
    return value.substring(0, visibleChars) + '*'.repeat(Math.min(maskedLength, 8)) + '...';
  }

  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /auth/i,
      /credential/i,
      /private/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(key));
  }
}

// Export singleton instance
export const secretManager = SecretManager.getInstance();