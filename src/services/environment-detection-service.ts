export interface EnvironmentConfig {
  isGitHubPages: boolean;
  isDockerDeployment: boolean;
  shouldUseInfluxDB: boolean;
  deploymentEnvironment: 'github-pages' | 'docker' | 'development';
  dataSource: 'influxdb' | 'simulation';
  influxDBConfig?: {
    url: string;
    token: string;
    org: string;
    bucket: string;
    timeout: number;
  };
}

export class EnvironmentDetectionService {
  private static instance: EnvironmentDetectionService | null = null;
  private config: EnvironmentConfig | null = null;

  private constructor() {}

  static getInstance(): EnvironmentDetectionService {
    if (!EnvironmentDetectionService.instance) {
      EnvironmentDetectionService.instance = new EnvironmentDetectionService();
    }
    return EnvironmentDetectionService.instance;
  }

  detectEnvironment(): EnvironmentConfig {
    if (this.config) {
      return this.config;
    }

    // Check for explicit environment variable first
    const explicitEnv = import.meta.env.VITE_DEPLOYMENT_ENV;
    const explicitDataSource = import.meta.env.VITE_DATA_SOURCE;

    let isGitHubPages = false;
    let isDockerDeployment = false;
    let deploymentEnvironment: 'github-pages' | 'docker' | 'development';

    if (explicitEnv === 'github-pages') {
      isGitHubPages = true;
      deploymentEnvironment = 'github-pages';
    } else if (explicitEnv === 'docker') {
      isDockerDeployment = true;
      deploymentEnvironment = 'docker';
    } else {
      // Auto-detect environment
      
      // Check for GitHub Pages deployment
      const currentUrl = window.location.href;
      const baseUrl = import.meta.env.BASE_URL || '/';
      
      if (currentUrl.includes('github.io') || 
          currentUrl.includes('pages.github.com') ||
          baseUrl.includes('github.io')) {
        isGitHubPages = true;
        deploymentEnvironment = 'github-pages';
      }
      // Check for Docker deployment indicators
      else if (this.hasDockerIndicators()) {
        isDockerDeployment = true;
        deploymentEnvironment = 'docker';
      }
      // Default to development
      else {
        deploymentEnvironment = 'development';
      }
    }

    // Determine data source based on environment
    const dataSource: 'influxdb' | 'simulation' = explicitDataSource === 'simulation' ? 'simulation' : 'influxdb';
    const shouldUseInfluxDB = dataSource === 'influxdb';

    // Get InfluxDB configuration if needed
    let influxDBConfig: EnvironmentConfig['influxDBConfig'];
    if (shouldUseInfluxDB) {
      influxDBConfig = {
        url: import.meta.env.VITE_INFLUXDB_URL || 'http://localhost:8086',
        token: import.meta.env.VITE_INFLUXDB_TOKEN || 'factory-admin-token',
        org: import.meta.env.VITE_INFLUXDB_ORG || 'factory-dashboard',
        bucket: import.meta.env.VITE_INFLUXDB_BUCKET || 'factory-data',
        timeout: 10000
      };
    }

    this.config = {
      isGitHubPages,
      isDockerDeployment,
      shouldUseInfluxDB,
      deploymentEnvironment,
      dataSource,
      influxDBConfig
    };

    console.log('Environment detected:', {
      deployment: deploymentEnvironment,
      dataSource,
      shouldUseInfluxDB,
      influxUrl: influxDBConfig?.url,
      explicitEnv,
      explicitDataSource,
      currentUrl: window.location.href,
      hasDockerIndicators: this.hasDockerIndicators(),
      envVars: {
        VITE_INFLUXDB_URL: import.meta.env.VITE_INFLUXDB_URL,
        VITE_INFLUXDB_TOKEN: import.meta.env.VITE_INFLUXDB_TOKEN,
        VITE_INFLUXDB_ORG: import.meta.env.VITE_INFLUXDB_ORG,
        VITE_INFLUXDB_BUCKET: import.meta.env.VITE_INFLUXDB_BUCKET,
        VITE_DEPLOYMENT_ENV: import.meta.env.VITE_DEPLOYMENT_ENV,
        VITE_DATA_SOURCE: import.meta.env.VITE_DATA_SOURCE
      }
    });

    return this.config;
  }

  private hasDockerIndicators(): boolean {
    // Check for Docker-specific environment characteristics
    
    // Check if we have Docker network hostname patterns
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Check if port suggests Docker mapping (like 3000 -> 80)
      const port = window.location.port;
      if (port === '3000' || port === '80') {
        return this.hasInfluxDBEnvironmentVars();
      }
    }

    // Check for Docker service URLs in environment
    const influxUrl = import.meta.env.VITE_INFLUXDB_URL;
    if (influxUrl && influxUrl.includes('influxdb:8086')) {
      return true;
    }

    // Check for typical Docker environment variables
    return this.hasInfluxDBEnvironmentVars();
  }

  private hasInfluxDBEnvironmentVars(): boolean {
    return !!(
      import.meta.env.VITE_INFLUXDB_URL ||
      import.meta.env.VITE_INFLUXDB_TOKEN ||
      import.meta.env.VITE_INFLUXDB_ORG ||
      import.meta.env.VITE_INFLUXDB_BUCKET
    );
  }

  getDataSourceStrategy(): 'influxdb' | 'simulation' {
    const config = this.detectEnvironment();
    return config.dataSource;
  }

  shouldAttemptInfluxDBConnection(): boolean {
    const config = this.detectEnvironment();
    return config.shouldUseInfluxDB;
  }

  getInfluxDBConfig() {
    const config = this.detectEnvironment();
    return config.influxDBConfig;
  }

  isProductionEnvironment(): boolean {
    const config = this.detectEnvironment();
    return config.isGitHubPages || config.isDockerDeployment;
  }

  shouldShowConnectionErrors(): boolean {
    const config = this.detectEnvironment();
    // Don't show connection errors in GitHub Pages mode
    return !config.isGitHubPages;
  }

  getEnvironmentInfo() {
    const config = this.detectEnvironment();
    return {
      environment: config.deploymentEnvironment,
      dataSource: config.dataSource,
      shouldUseInfluxDB: config.shouldUseInfluxDB,
      isProduction: this.isProductionEnvironment(),
      showConnectionErrors: this.shouldShowConnectionErrors(),
      influxDBUrl: config.influxDBConfig?.url
    };
  }

  // For testing - reset the singleton
  static resetInstance(): void {
    if (EnvironmentDetectionService.instance) {
      EnvironmentDetectionService.instance.config = null;
    }
    EnvironmentDetectionService.instance = null;
  }
}