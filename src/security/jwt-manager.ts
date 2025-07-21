/**
 * JWT Token Management System
 * Handles JWT token generation, validation, and refresh
 */

import { sign, verify, JsonWebTokenError, TokenExpiredError, type SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import type { UserContext } from '../types/auth-types';
import { AuthErrorCode } from '../types/auth-types';
import { secretManager } from './SecretManager';

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface RefreshTokenPayload {
  tokenId: string;
  type: 'refresh';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload | RefreshTokenPayload;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface TokenGenerationOptions {
  expiresIn?: string | number;
  audience?: string;
  issuer?: string;
  rememberMe?: boolean;
}

export class JWTManager {
  private static instance: JWTManager;
  private jwtSecret: string = '';
  private refreshSecret: string = '';
  private defaultExpiration: string = '15m';
  private refreshExpiration: string = '7d';
  private rememberMeExpiration: string = '30d';
  private issuer: string = 'factory-dashboard';
  private audience: string = 'factory-dashboard-users';

  private constructor() {}

  public static getInstance(): JWTManager {
    if (!JWTManager.instance) {
      JWTManager.instance = new JWTManager();
    }
    return JWTManager.instance;
  }

  /**
   * Initialize JWT Manager with secrets
   */
  public async initialize(): Promise<void> {
    try {
      this.jwtSecret = await secretManager.getSecret('JWT_SECRET');
      this.refreshSecret = await secretManager.getSecret('JWT_REFRESH_SECRET');
      
      if (!this.jwtSecret || !this.refreshSecret) {
        throw new Error('JWT secrets not configured');
      }
      
      console.log('✅ JWT Manager initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize JWT Manager:', error);
      throw error;
    }
  }

  /**
   * Generate access token for user
   */
  public generateAccessToken(
    userContext: UserContext,
    options: TokenGenerationOptions = {}
  ): string {
    if (!this.jwtSecret) {
      throw new Error('JWT Manager not initialized. Call initialize() first.');
    }
    
    const {
      expiresIn = options.rememberMe ? this.rememberMeExpiration : this.defaultExpiration,
      audience = this.audience,
      issuer = this.issuer
    } = options;

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: userContext.id,
      username: userContext.username,
      email: userContext.email,
      roles: userContext.roles,
      permissions: userContext.permissions,
      sessionId: userContext.sessionId,
      iss: issuer,
      aud: audience
    };

    const signOptions = {
      expiresIn,
      issuer,
      audience
    } as SignOptions;
    
    return sign(payload, this.jwtSecret, signOptions);
  }

  /**
   * Generate refresh token
   */
  public generateRefreshToken(): string {
    if (!this.refreshSecret) {
      throw new Error('JWT Manager not initialized. Call initialize() first.');
    }
    const payload = {
      tokenId: randomBytes(16).toString('hex'),
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    };

    const signOptions = {
      expiresIn: this.refreshExpiration,
      issuer: this.issuer,
      audience: this.audience
    } as SignOptions;
    
    return sign(payload, this.refreshSecret, signOptions);
  }

  /**
   * Generate both access and refresh tokens
   */
  public generateTokenPair(
    userContext: UserContext,
    options: TokenGenerationOptions = {}
  ): { accessToken: string; refreshToken: string; expiresAt: Date } {
    const accessToken = this.generateAccessToken(userContext, options);
    const refreshToken = this.generateRefreshToken();
    
    const expirationTime = options.rememberMe 
      ? this.parseExpiration(this.rememberMeExpiration)
      : this.parseExpiration(this.defaultExpiration);
    
    const expiresAt = new Date(Date.now() + expirationTime);

    return {
      accessToken,
      refreshToken,
      expiresAt
    };
  }

  /**
   * Validate access token
   */
  public validateAccessToken(token: string): TokenValidationResult {
    try {
      const payload = verify(token, this.jwtSecret, {
        issuer: this.issuer,
        audience: this.audience
      }) as JWTPayload;

      return {
        valid: true,
        payload
      };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        return {
          valid: false,
          error: 'Token expired',
          errorCode: AuthErrorCode.TOKEN_EXPIRED
        };
      } else if (error instanceof JsonWebTokenError) {
        return {
          valid: false,
          error: 'Invalid token',
          errorCode: AuthErrorCode.TOKEN_INVALID
        };
      } else {
        return {
          valid: false,
          error: 'Token validation failed',
          errorCode: AuthErrorCode.TOKEN_INVALID
        };
      }
    }
  }

  /**
   * Validate refresh token
   */
  public validateRefreshToken(token: string): TokenValidationResult {
    try {
      const payload = verify(token, this.refreshSecret, {
        issuer: this.issuer,
        audience: this.audience
      }) as RefreshTokenPayload;

      if (payload.type !== 'refresh') {
        return {
          valid: false,
          error: 'Invalid refresh token type',
          errorCode: AuthErrorCode.TOKEN_INVALID
        };
      }

      return {
        valid: true,
        payload
      };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        return {
          valid: false,
          error: 'Refresh token expired',
          errorCode: AuthErrorCode.TOKEN_EXPIRED
        };
      } else if (error instanceof JsonWebTokenError) {
        return {
          valid: false,
          error: 'Invalid refresh token',
          errorCode: AuthErrorCode.TOKEN_INVALID
        };
      } else {
        return {
          valid: false,
          error: 'Refresh token validation failed',
          errorCode: AuthErrorCode.TOKEN_INVALID
        };
      }
    }
  }

  /**
   * Extract user context from token
   */
  public extractUserContext(token: string): UserContext | null {
    const validation = this.validateAccessToken(token);
    
    if (!validation.valid || !validation.payload) {
      return null;
    }

    const payload = validation.payload;
    
    // Type guard to ensure we have a JWTPayload (not RefreshTokenPayload)
    if (!('userId' in payload)) {
      return null;
    }
    
    return {
      id: payload.userId,
      username: payload.username,
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
      sessionId: payload.sessionId,
      lastLogin: undefined // This would be populated from database
    };
  }

  /**
   * Check if token is expired
   */
  public isTokenExpired(token: string): boolean {
    try {
      const decoded = verify(token, this.jwtSecret, { ignoreExpiration: true }) as JWTPayload;
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch {
      return true;
    }
  }

  /**
   * Get token expiration time
   */
  public getTokenExpiration(token: string): Date | null {
    try {
      const decoded = verify(token, this.jwtSecret, { ignoreExpiration: true }) as JWTPayload;
      return new Date(decoded.exp * 1000);
    } catch {
      return null;
    }
  }

  /**
   * Revoke token (would typically involve a blacklist in production)
   */
  public revokeToken(token: string): boolean {
    // In a production system, this would add the token to a blacklist
    // For now, we'll just validate that the token is valid
    const validation = this.validateAccessToken(token);
    return validation.valid;
  }

  /**
   * Generate session ID
   */
  public generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Parse expiration string to milliseconds
   */
  private parseExpiration(expiration: string): number {
    const units: Record<string, number> = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${expiration}`);
    }

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit];
  }

  /**
   * Get configuration info (without secrets)
   */
  public getConfiguration(): {
    defaultExpiration: string;
    refreshExpiration: string;
    rememberMeExpiration: string;
    issuer: string;
    audience: string;
    secretsConfigured: boolean;
  } {
    return {
      defaultExpiration: this.defaultExpiration,
      refreshExpiration: this.refreshExpiration,
      rememberMeExpiration: this.rememberMeExpiration,
      issuer: this.issuer,
      audience: this.audience,
      secretsConfigured: !!(this.jwtSecret && this.refreshSecret)
    };
  }
}

// Export singleton instance
export const jwtManager = JWTManager.getInstance();