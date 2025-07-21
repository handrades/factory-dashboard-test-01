import express from 'express';
import { JWTManager } from '../security/jwt-manager.js';
import { UserService } from '../services/user-service.js';
import { SecurityLogger } from '../security/security-logger.js';
import { LoginRequest, LoginResponse, RefreshTokenRequest, RegisterRequest, ChangePasswordRequest } from '../types/auth-types.js';
import { AuthRequest } from '../middleware/auth-middleware.js';

export class AuthController {
  private jwtManager: JWTManager;
  private userService: UserService;
  private securityLogger: SecurityLogger;
  private refreshTokens: Map<string, { userId: string; expiresAt: Date }> = new Map();

  constructor(jwtManager: JWTManager, userService: UserService) {
    this.jwtManager = jwtManager;
    this.userService = userService;
    this.securityLogger = new SecurityLogger();
  }

  async login(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { username, password }: LoginRequest = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent') || 'unknown';

      // Authenticate user
      const user = await this.userService.authenticateUser(username, password, ipAddress || '', userAgent);
      
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Get user permissions
      const permissions = this.userService.getUserPermissions(user.id);

      // Generate tokens
      const accessToken = this.jwtManager.generateAccessToken(user, permissions);
      const refreshToken = this.jwtManager.generateRefreshToken(user);

      // Store refresh token
      const refreshTokenExpiry = new Date(Date.now() + this.jwtManager.getRefreshTokenExpiryTime());
      this.refreshTokens.set(refreshToken, {
        userId: user.id,
        expiresAt: refreshTokenExpiry
      });

      const response: LoginResponse = {
        accessToken,
        refreshToken,
        user: this.userService.getUserById(user.id)!,
        expiresIn: this.jwtManager.getAccessTokenExpiryTime()
      };

      res.json(response);
    } catch (error: unknown) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  async refreshToken(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { refreshToken }: RefreshTokenRequest = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token is required' });
        return;
      }

      // Verify refresh token
      const payload = this.jwtManager.verifyRefreshToken(refreshToken);
      
      // Check if token exists in our store
      const storedToken = this.refreshTokens.get(refreshToken);
      if (!storedToken || storedToken.userId !== payload.userId) {
        res.status(401).json({ error: 'Invalid refresh token' });
        return;
      }

      // Check if token is expired
      if (storedToken.expiresAt < new Date()) {
        this.refreshTokens.delete(refreshToken);
        res.status(401).json({ error: 'Refresh token expired' });
        return;
      }

      // Get user and verify they're still active
      const user = this.userService.getUserById(payload.userId);
      if (!user || !user.isActive) {
        this.refreshTokens.delete(refreshToken);
        res.status(401).json({ error: 'User account not found or inactive' });
        return;
      }

      // Get fresh user object for token generation
      const fullUser = this.userService.getUserByUsername(user.username);
      if (!fullUser) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Generate new tokens
      const permissions = this.userService.getUserPermissions(fullUser.id);
      const newAccessToken = this.jwtManager.generateAccessToken(fullUser, permissions);
      const newRefreshToken = this.jwtManager.generateRefreshToken(fullUser);

      // Remove old refresh token and store new one
      this.refreshTokens.delete(refreshToken);
      const refreshTokenExpiry = new Date(Date.now() + this.jwtManager.getRefreshTokenExpiryTime());
      this.refreshTokens.set(newRefreshToken, {
        userId: fullUser.id,
        expiresAt: refreshTokenExpiry
      });

      this.securityLogger.logTokenRefresh(
        fullUser.id,
        fullUser.username,
        req.ip,
        req.get('User-Agent') || 'unknown',
        true
      );

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: this.jwtManager.getAccessTokenExpiryTime()
      });
    } catch (error: unknown) {
      console.error('Token refresh error:', error);
      
      this.securityLogger.logTokenRefresh(
        'unknown',
        'unknown',
        req.ip,
        req.get('User-Agent') || 'unknown',
        false
      );

      res.status(401).json({ error: 'Token refresh failed' });
    }
  }

  async logout(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      // Remove refresh token if provided
      if (refreshToken) {
        this.refreshTokens.delete(refreshToken);
      }

      // In a real implementation, you might also want to blacklist the access token
      // until it expires naturally

      this.securityLogger.logSecurityEvent({
        eventType: 'USER_LOGOUT',
        userId: req.user?.userId,
        username: req.user?.username,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || 'unknown',
        severity: 'low',
        details: {}
      });

      res.json({ message: 'Logged out successfully' });
    } catch (error: unknown) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }

  async register(req: express.Request, res: express.Response): Promise<void> {
    try {
      const registerRequest: RegisterRequest = req.body;

      if (!registerRequest.username || !registerRequest.email || !registerRequest.password) {
        res.status(400).json({ error: 'Username, email, and password are required' });
        return;
      }

      // Create user
      const user = await this.userService.createUser(registerRequest);

      this.securityLogger.logSecurityEvent({
        eventType: 'USER_REGISTERED',
        username: registerRequest.username,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || 'unknown',
        severity: 'medium',
        details: {
          userId: user.id,
          roles: user.roles
        }
      });

      res.status(201).json({
        message: 'User created successfully',
        user
      });
    } catch (error: unknown) {
      console.error('Registration error:', error);
      
      this.securityLogger.logSecurityEvent({
        eventType: 'USER_REGISTRATION_FAILED',
        username: req.body?.username,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || 'unknown',
        severity: 'medium',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      res.status(400).json({ error: error instanceof Error ? error.message : 'Operation failed' });
    }
  }

  async changePassword(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const changePasswordRequest: ChangePasswordRequest = req.body;

      if (!changePasswordRequest.currentPassword || !changePasswordRequest.newPassword) {
        res.status(400).json({ error: 'Current password and new password are required' });
        return;
      }

      await this.userService.changePassword(
        req.user.userId,
        changePasswordRequest,
        req.ip,
        req.get('User-Agent') || 'unknown'
      );

      res.json({ message: 'Password changed successfully' });
    } catch (error: unknown) {
      console.error('Change password error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Operation failed' });
    }
  }

  async getProfile(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = this.userService.getUserById(req.user.userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const permissions = this.userService.getUserPermissions(req.user.userId);

      res.json({
        user,
        permissions
      });
    } catch (error: unknown) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }

  async validateToken(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      res.json({
        valid: true,
        user: req.user,
        expiresIn: this.jwtManager.getAccessTokenExpiryTime()
      });
    } catch (error: unknown) {
      console.error('Validate token error:', error);
      res.status(401).json({ error: 'Token validation failed' });
    }
  }

  // Admin endpoints
  async getAllUsers(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      const users = this.userService.getAllUsers();
      res.json({ users });
    } catch (error: unknown) {
      console.error('Get all users error:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  }

  async updateUserRoles(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { roles } = req.body;

      if (!userId || !Array.isArray(roles)) {
        res.status(400).json({ error: 'User ID and roles array are required' });
        return;
      }

      await this.userService.updateUserRoles(userId, roles, req.user!.userId);

      res.json({ message: 'User roles updated successfully' });
    } catch (error: unknown) {
      console.error('Update user roles error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Operation failed' });
    }
  }

  async deactivateUser(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      // Prevent self-deactivation
      if (userId === req.user!.userId) {
        res.status(400).json({ error: 'Cannot deactivate your own account' });
        return;
      }

      await this.userService.deactivateUser(userId, req.user!.userId);

      res.json({ message: 'User deactivated successfully' });
    } catch (error: unknown) {
      console.error('Deactivate user error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Operation failed' });
    }
  }

  async getRoles(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      const roles = this.userService.getAllRoles();
      res.json({ roles });
    } catch (error: unknown) {
      console.error('Get roles error:', error);
      res.status(500).json({ error: 'Failed to get roles' });
    }
  }

  async getStats(req: AuthRequest, res: express.Response): Promise<void> {
    try {
      const stats = this.userService.getUserStats();
      const securityEvents = this.securityLogger.getRecentEvents(50);
      
      res.json({
        userStats: stats,
        recentSecurityEvents: securityEvents.map(event => ({
          eventType: event.eventType,
          severity: event.severity,
          timestamp: event.timestamp,
          username: event.username || 'anonymous'
        }))
      });
    } catch (error: unknown) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  }

  // Cleanup expired refresh tokens periodically
  cleanupExpiredTokens(): void {
    const now = new Date();
    
    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.expiresAt < now) {
        this.refreshTokens.delete(token);
      }
    }
    
    console.log(`Cleaned up expired refresh tokens. Active tokens: ${this.refreshTokens.size}`);
  }
}

export default AuthController;