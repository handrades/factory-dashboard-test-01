import express from 'express';
import rateLimit from 'express-rate-limit';
import { JWTManager } from '../security/jwt-manager.js';
import { UserService } from '../services/user-service.js';
import { SecurityLogger } from '../security/security-logger.js';
import { TokenPayload } from '../types/auth-types.js';

export interface AuthRequest extends express.Request {
  user?: {
    userId: string;
    username: string;
    roles: string[];
    permissions: any[];
  };
}

export class AuthMiddleware {
  private jwtManager: JWTManager;
  private userService: UserService;
  private securityLogger: SecurityLogger;

  constructor(jwtManager: JWTManager, userService: UserService) {
    this.jwtManager = jwtManager;
    this.userService = userService;
    this.securityLogger = new SecurityLogger();
  }

  // Rate limiting middleware for authentication endpoints
  createAuthRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: {
        error: 'Too many authentication attempts',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        return req.ip + ':' + (req.body?.username || 'unknown');
      },
      onLimitReached: (req) => {
        this.securityLogger.logSuspiciousActivity(
          'Rate limit exceeded for authentication',
          req.ip,
          req.get('User-Agent') || 'unknown',
          undefined,
          req.body?.username,
          { endpoint: req.path, windowMs: 15 * 60 * 1000, maxAttempts: 5 }
        );
      }
    });
  }

  // General API rate limiting
  createApiRateLimit() {
    return rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      message: {
        error: 'Too many API requests',
        retryAfter: '1 minute'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
  }

  // JWT token verification middleware
  verifyToken() {
    return async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
          return res.status(401).json({ error: 'Authorization header missing' });
        }

        const token = this.jwtManager.extractTokenFromHeader(authHeader);
        const payload: TokenPayload = this.jwtManager.verifyAccessToken(token);

        // Get user details and verify they still exist and are active
        const user = this.userService.getUserById(payload.userId);
        if (!user || !user.isActive) {
          this.securityLogger.logUnauthorizedAccess(
            req.path,
            req.ip,
            req.get('User-Agent') || 'unknown',
            payload.userId,
            payload.username
          );
          return res.status(401).json({ error: 'User account not found or inactive' });
        }

        // Add user info to request
        req.user = {
          userId: payload.userId,
          username: payload.username,
          roles: payload.roles,
          permissions: payload.permissions
        };

        next();
      } catch (error: any) {
        this.securityLogger.logUnauthorizedAccess(
          req.path,
          req.ip,
          req.get('User-Agent') || 'unknown'
        );

        if (error.message === 'Access token expired') {
          return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }

        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  }

  // Role-based authorization middleware
  requireRole(requiredRoles: string | string[]) {
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

    return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userRoles = req.user.roles;
      const hasRequiredRole = roles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        this.securityLogger.logUnauthorizedAccess(
          req.path,
          req.ip,
          req.get('User-Agent') || 'unknown',
          req.user.userId,
          req.user.username
        );

        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: roles,
          current: userRoles
        });
      }

      next();
    };
  }

  // Permission-based authorization middleware
  requirePermission(resource: string, action: string) {
    return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasPermission = this.userService.hasPermission(req.user.userId, resource, action);

      if (!hasPermission) {
        this.securityLogger.logUnauthorizedAccess(
          req.path,
          req.ip,
          req.get('User-Agent') || 'unknown',
          req.user.userId,
          req.user.username
        );

        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: { resource, action }
        });
      }

      next();
    };
  }

  // Admin-only middleware
  requireAdmin() {
    return this.requireRole('admin');
  }

  // Optional authentication middleware (doesn't fail if no token)
  optionalAuth() {
    return async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
          return next(); // Continue without authentication
        }

        const token = this.jwtManager.extractTokenFromHeader(authHeader);
        const payload: TokenPayload = this.jwtManager.verifyAccessToken(token);

        const user = this.userService.getUserById(payload.userId);
        if (user && user.isActive) {
          req.user = {
            userId: payload.userId,
            username: payload.username,
            roles: payload.roles,
            permissions: payload.permissions
          };
        }
      } catch (error) {
        // Ignore token errors for optional auth
      }

      next();
    };
  }

  // Security headers middleware
  securityHeaders() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Basic security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Content Security Policy
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "font-src 'self'",
        "object-src 'none'",
        "media-src 'self'",
        "frame-src 'none'"
      ].join('; '));

      // Remove server information
      res.removeHeader('X-Powered-By');

      next();
    };
  }

  // Request logging middleware
  requestLogger() {
    return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
      const startTime = Date.now();

      // Log request
      const logData = {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.userId,
        username: req.user?.username,
        timestamp: new Date().toISOString()
      };

      // Override res.end to capture response details
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any) {
        const responseTime = Date.now() - startTime;
        
        // Log security events for sensitive operations
        if (req.path.includes('/auth/') || req.path.includes('/users/') || res.statusCode >= 400) {
          const severity = res.statusCode >= 500 ? 'high' : 
                          res.statusCode >= 400 ? 'medium' : 'low';

          console.log(`API Request: ${req.method} ${req.path} - ${res.statusCode} (${responseTime}ms)`, {
            ...logData,
            statusCode: res.statusCode,
            responseTime
          });
        }

        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  // Input sanitization middleware
  sanitizeInput() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Sanitize common injection patterns
      const sanitize = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
        }
        
        if (Array.isArray(obj)) {
          return obj.map(sanitize);
        }
        
        if (obj && typeof obj === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitize(value);
          }
          return sanitized;
        }
        
        return obj;
      };

      if (req.body) {
        req.body = sanitize(req.body);
      }
      
      if (req.query) {
        req.query = sanitize(req.query);
      }

      next();
    };
  }

  // Error handling middleware
  errorHandler() {
    return (error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Log security-related errors
      if (error.name === 'ValidationError' || error.name === 'SecurityError') {
        this.securityLogger.logSuspiciousActivity(
          error.message,
          req.ip,
          req.get('User-Agent') || 'unknown',
          undefined,
          undefined,
          { error: error.name, path: req.path }
        );
      }

      // Don't expose sensitive error details
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          error: error.message,
          ...(isDevelopment && { stack: error.stack })
        });
      }

      console.error('Unhandled error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        ...(isDevelopment && { 
          message: error.message,
          stack: error.stack 
        })
      });
    };
  }
}

export default AuthMiddleware;