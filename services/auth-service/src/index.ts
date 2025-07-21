import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { JWTManager } from './security/jwt-manager.js';
import { UserService } from './services/user-service.js';
import AuthController from './controllers/auth-controller.js';
import AuthMiddleware from './middleware/auth-middleware.js';
import createAuthRoutes from './routes/auth-routes.js';
import { AuthConfig } from './types/auth-types.js';

// Remove the broken import - using environment variables directly

class AuthService {
  private app: express.Application;
  private authController!: AuthController;
  private authMiddleware!: AuthMiddleware;

  constructor() {
    this.app = express();
    this.setupService();
  }

  private setupService(): void {
    // Load configuration
    const config: AuthConfig = {
      jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
      jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      passwordMinLength: 12,
      maxFailedAttempts: 5,
      lockoutDurationMinutes: 15,
      passwordComplexity: {
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      }
    };

    // Initialize services
    const jwtManager = new JWTManager(
      config.jwtSecret,
      config.jwtRefreshSecret,
      config.accessTokenExpiry,
      config.refreshTokenExpiry
    );

    const userService = new UserService(config);
    this.authController = new AuthController(jwtManager, userService);
    this.authMiddleware = new AuthMiddleware(jwtManager, userService);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.startCleanupTasks();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3002'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);

    // General API rate limiting
    this.app.use('/api/', this.authMiddleware.createApiRateLimit());
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      });
    });

    // API routes
    this.app.use('/api/auth', createAuthRoutes(this.authController, this.authMiddleware));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.originalUrl,
        method: req.method
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(this.authMiddleware.errorHandler());

    // Global error handler
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  private startCleanupTasks(): void {
    // Clean up expired refresh tokens every hour
    setInterval(() => {
      this.authController.cleanupExpiredTokens();
    }, 60 * 60 * 1000);

    // Initial cleanup
    setTimeout(() => {
      this.authController.cleanupExpiredTokens();
    }, 5000);
  }

  public start(port: number = 3001): void {
    this.app.listen(port, () => {
      console.log(`🔐 Auth Service running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
      console.log(`🔑 API endpoints: http://localhost:${port}/api/auth`);
      console.log('🛡️  Security features enabled:');
      console.log('   - JWT authentication with refresh tokens');
      console.log('   - Rate limiting and DDoS protection');
      console.log('   - Input validation and sanitization');
      console.log('   - Security headers and CSP');
      console.log('   - Comprehensive audit logging');
      console.log('   - Role-based access control');
    });
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const authService = new AuthService();
  const port = parseInt(process.env.AUTH_SERVICE_PORT || '3001', 10);
  authService.start(port);
}

export default AuthService;