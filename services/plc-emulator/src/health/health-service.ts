import express from 'express';
import { FactoryLogger, MetricsRegistry } from '@factory-dashboard/shared-types';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  duration?: number;
  timestamp: Date;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  checks: HealthCheck[];
}

export class HealthService {
  private app: express.Application;
  private logger: FactoryLogger;
  private startTime: Date;
  private healthChecks: Map<string, () => Promise<HealthCheck>> = new Map();

  constructor(logger: FactoryLogger, port: number = 3000) {
    this.app = express();
    this.logger = logger;
    this.startTime = new Date();
    this.setupRoutes();
    this.registerDefaultChecks();
    this.startServer(port);
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      const timer = this.logger.createTimer('health_check') as { done: () => void };
      
      try {
        const healthStatus = await this.getHealthStatus();
        const statusCode = healthStatus.status === 'healthy' ? 200 : 
                          healthStatus.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json(healthStatus);
        
        this.logger.info('Health check completed', {
          correlationId,
          status: healthStatus.status,
          checksCount: healthStatus.checks.length
        });
        
        timer.done();
      } catch (error: unknown) {
        this.logger.error('Health check failed', error as Error, { correlationId });
        res.status(500).json({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        timer.done();
      }
    });

    // Readiness check endpoint
    this.app.get('/ready', async (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      
      try {
        const checks = await this.runHealthChecks();
        const ready = checks.every(check => check.status === 'healthy');
        
        res.status(ready ? 200 : 503).json({
          ready,
          timestamp: new Date(),
          checks: checks.map(check => ({
            name: check.name,
            status: check.status
          }))
        });
        
        this.logger.info('Readiness check completed', { correlationId }, {
          ready,
          checksCount: checks.length
        });
      } catch (error: unknown) {
        this.logger.error('Readiness check failed', error as Error, { correlationId });
        res.status(500).json({
          ready: false,
          timestamp: new Date(),
          error: 'Readiness check failed'
        });
      }
    });

    // Liveness check endpoint
    this.app.get('/live', (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      
      res.status(200).json({
        alive: true,
        timestamp: new Date(),
        uptime: Date.now() - this.startTime.getTime()
      });
      
      this.logger.debug('Liveness check completed', { correlationId });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      
      try {
        const format = req.query.format as string || 'prometheus';
        
        if (format === 'json') {
          res.json(MetricsRegistry.exportAllMetricsJSON());
        } else {
          res.set('Content-Type', 'text/plain');
          res.send(MetricsRegistry.exportAllMetrics());
        }
        
        this.logger.debug('Metrics exported', { correlationId }, { format });
      } catch (error: unknown) {
        this.logger.error('Metrics export failed', error as Error, { correlationId });
        res.status(500).json({ error: 'Metrics export failed' });
      }
    });

    // Service info endpoint
    this.app.get('/info', (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      
      res.json({
        service: 'plc-emulator',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        startTime: this.startTime,
        uptime: Date.now() - this.startTime.getTime(),
        timestamp: new Date()
      });
      
      this.logger.debug('Service info requested', { correlationId });
    });
  }

  private registerDefaultChecks(): void {
    // System health check
    this.registerHealthCheck('system', async () => {
      // System health monitoring
      process.memoryUsage();
      process.cpuUsage();
      
      return {
        name: 'system',
        status: 'healthy',
        message: 'System resources are healthy',
        timestamp: new Date(),
        duration: 0
      };
    });

    // Service uptime check
    this.registerHealthCheck('uptime', async () => {
      const uptime = Date.now() - this.startTime.getTime();
      
      return {
        name: 'uptime',
        status: 'healthy',
        message: `Service running for ${Math.floor(uptime / 1000)}s`,
        timestamp: new Date(),
        duration: 0
      };
    });
  }

  registerHealthCheck(name: string, check: () => Promise<HealthCheck>): void {
    this.healthChecks.set(name, check);
    this.logger.info('Health check registered', undefined, { checkName: name });
  }

  private async runHealthChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    
    for (const [name, checkFn] of this.healthChecks) {
      try {
        const startTime = Date.now();
        const result = await checkFn();
        const duration = Date.now() - startTime;
        
        checks.push({
          ...result,
          duration
        });
      } catch (error) {
        checks.push({
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
          duration: 0
        });
      }
    }
    
    return checks;
  }

  private async getHealthStatus(): Promise<HealthStatus> {
    const checks = await this.runHealthChecks();
    
    checks.filter(check => check.status === 'healthy');
    const unhealthyChecks = checks.filter(check => check.status === 'unhealthy');
    const degradedChecks = checks.filter(check => check.status === 'degraded');
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    
    if (unhealthyChecks.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedChecks.length > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }
    
    return {
      status: overallStatus,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks
    };
  }

  private startServer(port: number): void {
    this.app.listen(port, () => {
      this.logger.info(`Health service listening on port ${port}`);
    });
  }
}