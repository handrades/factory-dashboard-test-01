import jwt from 'jsonwebtoken';
import { TokenPayload, User, Permission } from '../types/auth-types.js';

export class JWTManager {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor(
    accessSecret: string,
    refreshSecret: string,
    accessExpiry: string = '15m',
    refreshExpiry: string = '7d'
  ) {
    this.accessTokenSecret = accessSecret;
    this.refreshTokenSecret = refreshSecret;
    this.accessTokenExpiry = accessExpiry;
    this.refreshTokenExpiry = refreshExpiry;
  }

  generateAccessToken(user: User, permissions: Permission[]): string {
    const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      permissions,
      type: 'access'
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'factory-dashboard-auth',
      audience: 'factory-dashboard-services'
    });
  }

  generateRefreshToken(user: User): string {
    const payload: Omit<TokenPayload, 'iat' | 'exp' | 'permissions'> = {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      type: 'refresh'
    };

    return jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'factory-dashboard-auth',
      audience: 'factory-dashboard-services'
    });
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'factory-dashboard-auth',
        audience: 'factory-dashboard-services'
      }) as TokenPayload;

      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return payload;
    } catch {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      } else if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  verifyRefreshToken(token: string): Omit<TokenPayload, 'permissions'> {
    try {
      const payload = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'factory-dashboard-auth',
        audience: 'factory-dashboard-services'
      }) as Omit<TokenPayload, 'permissions'>;

      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return payload;
    } catch {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  extractTokenFromHeader(authHeader: string): string {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    if (!token) {
      throw new Error('Token not provided');
    }

    return token;
  }

  getTokenExpiry(token: string): Date {
    try {
      const decoded = jwt.decode(token) as Record<string, unknown>;
      if (!decoded || !decoded.exp) {
        throw new Error('Invalid token structure');
      }
      return new Date(decoded.exp * 1000);
    } catch {
      throw new Error('Failed to extract token expiry');
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const expiry = this.getTokenExpiry(token);
      return expiry < new Date();
    } catch {
      return true;
    }
  }

  getAccessTokenExpiryTime(): number {
    return this.parseExpiry(this.accessTokenExpiry);
  }

  getRefreshTokenExpiryTime(): number {
    return this.parseExpiry(this.refreshTokenExpiry);
  }

  private parseExpiry(expiry: string): number {
    const regex = /^(\d+)([smhd])$/;
    const match = expiry.match(regex);
    
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Unsupported time unit: ${unit}`);
    }
  }
}