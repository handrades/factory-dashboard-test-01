/**
 * Rate Limiting System
 * Provides rate limiting functionality for API endpoints and user actions
 */

import type { RateLimitInfo } from '../types/auth-types';
import { SecuritySeverity } from '../types/auth-types';
import { securityLogger } from './security-logger';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (identifier: string) => string;
  onLimitReached?: (identifier: string, info: RateLimitInfo) => void;
}

export interface RateLimitEntry {
  count: number;
  resetTime: Date;
  firstRequest: Date;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitEntry> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Configure rate limiting for a specific endpoint or action
   */
  public configure(name: string, config: RateLimitConfig): void {
    this.configs.set(name, config);
    console.log(`🚦 Rate limiter configured for: ${name} (${config.maxRequests} requests per ${config.windowMs}ms)`);
  }

  /**
   * Check if request is allowed under rate limit
   */
  public isAllowed(
    configName: string,
    identifier: string,
    isSuccessful?: boolean
  ): { allowed: boolean; info: RateLimitInfo } {
    const config = this.configs.get(configName);
    if (!config) {
      throw new Error(`Rate limit configuration not found: ${configName}`);
    }

    // Generate key for this identifier
    const key = config.keyGenerator ? config.keyGenerator(identifier) : `${configName}:${identifier}`;
    
    const now = new Date();
    const entry = this.limits.get(key);

    // If no entry exists, create one
    if (!entry) {
      const resetTime = new Date(now.getTime() + config.windowMs);
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime,
        firstRequest: now
      };
      
      this.limits.set(key, newEntry);
      
      return {
        allowed: true,
        info: {
          windowStart: now,
          requestCount: 1,
          maxRequests: config.maxRequests,
          windowDuration: config.windowMs,
          isLimited: false,
          resetTime
        }
      };
    }

    // Check if window has expired
    if (now >= entry.resetTime) {
      // Reset the window
      const resetTime = new Date(now.getTime() + config.windowMs);
      entry.count = 1;
      entry.resetTime = resetTime;
      entry.firstRequest = now;
      
      return {
        allowed: true,
        info: {
          windowStart: now,
          requestCount: 1,
          maxRequests: config.maxRequests,
          windowDuration: config.windowMs,
          isLimited: false,
          resetTime
        }
      };
    }

    // Check if we should skip this request based on success/failure
    if (isSuccessful !== undefined) {
      if (config.skipSuccessfulRequests && isSuccessful) {
        return {
          allowed: true,
          info: {
            windowStart: entry.firstRequest,
            requestCount: entry.count,
            maxRequests: config.maxRequests,
            windowDuration: config.windowMs,
            isLimited: false,
            resetTime: entry.resetTime
          }
        };
      }
      
      if (config.skipFailedRequests && !isSuccessful) {
        return {
          allowed: true,
          info: {
            windowStart: entry.firstRequest,
            requestCount: entry.count,
            maxRequests: config.maxRequests,
            windowDuration: config.windowMs,
            isLimited: false,
            resetTime: entry.resetTime
          }
        };
      }
    }

    // Increment counter
    entry.count++;

    const info: RateLimitInfo = {
      windowStart: entry.firstRequest,
      requestCount: entry.count,
      maxRequests: config.maxRequests,
      windowDuration: config.windowMs,
      isLimited: entry.count > config.maxRequests,
      resetTime: entry.resetTime
    };

    // Check if limit is exceeded
    if (entry.count > config.maxRequests) {
      // Log rate limit violation
      securityLogger.logSecurityViolationEvent({
        violationType: 'rate_limit_exceeded',
        description: `Rate limit exceeded for ${configName}`,
        riskLevel: SecuritySeverity.MEDIUM,
        automaticResponse: 'Request blocked',
        additionalContext: {
          configName,
          identifier,
          requestCount: entry.count,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs
        }
      }, identifier);

      // Call onLimitReached callback if provided
      config.onLimitReached?.(identifier, info);

      return {
        allowed: false,
        info
      };
    }

    return {
      allowed: true,
      info
    };
  }

  /**
   * Reset rate limit for specific identifier
   */
  public reset(configName: string, identifier: string): void {
    const config = this.configs.get(configName);
    if (!config) {
      throw new Error(`Rate limit configuration not found: ${configName}`);
    }

    const key = config.keyGenerator ? config.keyGenerator(identifier) : `${configName}:${identifier}`;
    this.limits.delete(key);
    
    console.log(`🔄 Rate limit reset for: ${configName}:${identifier}`);
  }

  /**
   * Get current rate limit status
   */
  public getStatus(configName: string, identifier: string): RateLimitInfo | null {
    const config = this.configs.get(configName);
    if (!config) {
      return null;
    }

    const key = config.keyGenerator ? config.keyGenerator(identifier) : `${configName}:${identifier}`;
    const entry = this.limits.get(key);
    
    if (!entry) {
      return null;
    }

    const now = new Date();
    
    // Check if window has expired
    if (now >= entry.resetTime) {
      return null;
    }

    return {
      windowStart: entry.firstRequest,
      requestCount: entry.count,
      maxRequests: config.maxRequests,
      windowDuration: config.windowMs,
      isLimited: entry.count > config.maxRequests,
      resetTime: entry.resetTime
    };
  }

  /**
   * Get all active rate limits
   */
  public getAllStatus(): Array<{
    key: string;
    info: RateLimitInfo;
    configName: string;
  }> {
    const results: Array<{
      key: string;
      info: RateLimitInfo;
      configName: string;
    }> = [];

    const now = new Date();

    for (const [key, entry] of this.limits.entries()) {
      // Skip expired entries
      if (now >= entry.resetTime) {
        continue;
      }

      // Find config name from key
      const configName = key.split(':')[0];
      const config = this.configs.get(configName);
      
      if (!config) {
        continue;
      }

      results.push({
        key,
        configName,
        info: {
          windowStart: entry.firstRequest,
          requestCount: entry.count,
          maxRequests: config.maxRequests,
          windowDuration: config.windowMs,
          isLimited: entry.count > config.maxRequests,
          resetTime: entry.resetTime
        }
      });
    }

    return results;
  }

  /**
   * Create Express middleware for rate limiting
   */
  public createMiddleware(configName: string, options: {
    keyGenerator?: (req: unknown) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    onLimitReached?: (req: unknown, res: unknown, info: RateLimitInfo) => void;
  } = {}) {
    return (req: { ip?: string; connection?: { remoteAddress?: string }; [key: string]: unknown }, res: { set?: (headers: Record<string, string>) => void; status?: (code: number) => { json: (data: unknown) => void } }, next: (() => void) | undefined) => {
      const identifier = options.keyGenerator ? 
        options.keyGenerator(req) : 
        req.ip || req.connection?.remoteAddress || 'unknown';

      const result = this.isAllowed(configName, identifier);

      // Add rate limit headers
      if (res.set) {
        res.set({
        'X-RateLimit-Limit': result.info.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, result.info.maxRequests - result.info.requestCount).toString(),
        'X-RateLimit-Reset': Math.ceil(result.info.resetTime.getTime() / 1000).toString(),
        'X-RateLimit-Window': result.info.windowDuration.toString()
        });
      }

      if (!result.allowed) {
        // Call custom handler if provided
        if (options.onLimitReached) {
          options.onLimitReached(req, res, result.info);
          return;
        }

        // Default response
        if (res.status) {
          res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((result.info.resetTime.getTime() - Date.now()) / 1000),
          limit: result.info.maxRequests,
          remaining: 0,
          resetTime: result.info.resetTime.toISOString()
        });
        }
        return;
      }

      if (next) next();
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        this.limits.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }

  /**
   * Get statistics
   */
  public getStatistics(): {
    totalEntries: number;
    activeEntries: number;
    configuredLimits: number;
    topLimitedIdentifiers: Array<{ identifier: string; count: number }>;
  } {
    const now = new Date();
    const activeEntries = Array.from(this.limits.entries())
      .filter(([, entry]) => now < entry.resetTime);

    // Get top limited identifiers
    const identifierCounts: Record<string, number> = {};
    
    for (const [key, entry] of activeEntries) {
      const identifier = key.split(':').slice(1).join(':');
      identifierCounts[identifier] = (identifierCounts[identifier] || 0) + entry.count;
    }

    const topLimitedIdentifiers = Object.entries(identifierCounts)
      .map(([identifier, count]) => ({ identifier, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEntries: this.limits.size,
      activeEntries: activeEntries.length,
      configuredLimits: this.configs.size,
      topLimitedIdentifiers
    };
  }

  /**
   * Destroy the rate limiter and clean up resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.limits.clear();
    this.configs.clear();
  }
}

// Export singleton instance
export const rateLimiter = RateLimiter.getInstance();

// Configure default rate limits
rateLimiter.configure('login', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true,
  onLimitReached: (identifier) => {
    console.log(`🚨 Login rate limit exceeded for: ${identifier}`);
  }
});

rateLimiter.configure('api', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  onLimitReached: (identifier) => {
    console.log(`🚨 API rate limit exceeded for: ${identifier}`);
  }
});

rateLimiter.configure('password_reset', {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 attempts per hour
  onLimitReached: (identifier) => {
    console.log(`🚨 Password reset rate limit exceeded for: ${identifier}`);
  }
});